import path from 'path';
import prompts from 'prompts';
import {readFile} from 'fs/promises';
import {existsSync} from 'fs';
import {execa} from 'execa';

let __workdir = getWorkingDirectory();

try {
    void main();
} catch(error) {
    logError(error);
}

async function main() {
    const packages = await getWorkspacePackages();
    const response = await promptUser(packages);

    const packageInfo = packages.find((pkg) => pkg.name === response.packageName);

    await bump({
        ...response,
        packageInfo,
    });

    console.log('Done');
}

function getWorkingDirectory() {
    const args = process.argv.slice(2);
    if (args[0]) {
        console.log(`Using working directory: ${args[0]}`);
        return args[0];
    }
    return process.cwd();
}

async function promptUser(packages) {
    const packageChoices = packages.map((pkg) => ({
        title: pkg.nameNoScope,
        description: pkg.name,
        value: pkg.name
    }));
    return await prompts([
        {
            type: 'text',
            name: 'branch',
            message: `Main branch name`,
            initial: `master`,
        },
        {
            type: 'text',
            name: 'remote',
            message: `Remote name`,
            initial: `origin`,
        },
        {
            type: 'select',
            name: 'packageName',
            message: 'Choose a package to bump',
            choices: packageChoices,
        },
        {
            type: 'select',
            name: 'releaseType',
            message: 'Choose a release type',
            choices: [
                {title: 'patch', description: 'Bug fixes', value: 'patch'},
                {title: 'minor', description: 'Backwards compatible features', value: 'minor'},
                {title: 'major', description: 'Contains breaking changes', value: 'major'},
            ]
        },
    ]);
}

async function bump({
    branch,
    remote,
    releaseType,
    packageInfo,
}) {
    const isClean = ensureCleanBranch(branch, remote);
    if (!isClean) {
        return exitWithError('Could not ensure the local branch is clean.');
    }

    console.log(`Getting latest from "${branch}"...`);
    await run('git', ['fetch']);
    await run('git', ['pull']);

    console.log(`Running 'npm version' with "${releaseType}"`);
    const {stdio: nextVersion} = await run('npm', [
        'version',
        '--git-tag-version=false',
        releaseType
    ]);

    console.log(`Next version: ${nextVersion}`);

    const releaseBranchName = `${packageInfo.nameNoScope}-${nextVersion}`;
    const commitMessage = `bump ${releaseBranchName}`;

    console.log(`Creating release branch: ${releaseBranchName}`);
    await run('git', ['branch', releaseBranchName]);
    await run('git', ['add', '--all']);
    await run('git', ['commit', '-m', commitMessage]);
    await run('git', ['push']);
    await run('git', ['checkout', branch]);

//stdio: 'inherit'


}

async function getHashFor(branch) {
    try {
        const {stdout} = await run('git', ['rev-parse', '--verify', branch]);
        return stdout;
    } catch (error) {
        console.error(error.message);
        throw new Error(
            `Git couldn't find the branch "${branch}"; please ensure it exists`,
        );
    }
}

async function hasUncommittedChanges() {
    const stdout = run('git', ['status', '-s']);
    return stdout.length > 0;
}

async function ensureCleanBranch(branch, remote) {
    try {
        const headHash = await getHashFor('HEAD');
        const branchHash = await getHashFor(branch);
        const remoteBranch = await getHashFor(`${remote}/${branch}`);
        if (headHash !== branchHash) {
            logError(`You need to be on the "${branch}" branch to run this script`);
            return false;
        }
        if (branchHash !== remoteBranch) {
            logError(`You need to push your changes first`);
            return false;
        }
        return true;
    } catch(error) {
        logError(error);
        return false;
    }
}

async function getWorkspacePackages() {
    const packages = [];

    const root = await readPackageJson(__workdir);

    packages.push({
        root: true,
        name: root.name,
        version: root.version,
        nameNoScope: getPackageNameNoScope(root.name),
        file: path.join(__workdir, 'package.json'),
        packageJson: root
    });

    if (!Array.isArray(root.workspaces)) {
        return packages;
    }

    return packages;
}

function getPackageNameNoScope(packageName) {
    const n = packageName.indexOf('/');
    return n === -1 ? packageName : packageName.substring(n + 1);
}

async function readPackageJson(directoryPath) {
    const packageJSONPath = path.join(directoryPath, 'package.json');
    if (!existsSync(packageJSONPath)) {
        exitWithError(`package.json does not exist in directory: ${packageJSONPath}`);
        return null;
    }
    try {
        const packageJSON = await readJSON(packageJSONPath);
        verifyPackageJson(packageJSON);
        return packageJSON;
    } catch(error) {
        logError(error);
        exitWithError(`package.json could not be read: ${packageJSONPath}`);
        return null;
    }
}

function verifyPackageJson(packageJson) {
    if (!packageJson) {
        throw new Error('package.json is undefined');
    }
    if (!packageJson.version) {
        throw new Error('package.json is missing a "version" attribute');
    }
    if (typeof packageJson.version !== 'string') {
        throw new Error('package.json "version" must be a string');
    }
    if (!packageJson.name) {
        throw new Error('package.json is missing a "name" attribute');
    }
    if (typeof packageJson.name !== 'string') {
        throw new Error('package.json "name" attribute must be a string');
    }
}

async function run(command, args, options) {
    return execa(command, args, {cwd: __workdir, ...options});
}

export async function readJSON(filePath) {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

function logError(error) {
    console.error(`✖ ERROR \n${error.stack || error}`);
}

function logWarning(message) {
    console.error(`⚠ WARN \n${message}`);
}

function exitWithError(message) {
    console.error(`✖ ERROR \n${message}`);
    process.exit(1);
}
