import path from 'path';
import prompts from 'prompts';
import {readFile} from 'fs/promises';
import {existsSync} from 'fs';
import {execa} from 'execa';
import glob from 'glob';

let __workdir = getWorkingDirectory();

try {
    void main();
} catch(error) {
    logError(error);
    process.exit(1);
}

async function main() {
    console.log(`\nbumpbot ${getWakeUpMessage()}...\n`);
    void await ensurePrerequisites();

    const packages = await getWorkspacePackages();
    const response = await promptUser(packages, {
        onCancel: () => {
            console.log(`\n${getExitExcuse()}`);
            process.exit(1);
        }
    });

    const packageInfo = packages.find((pkg) => pkg.name === response.packageName);

    await bump({
        ...response,
        packageInfo,
    });

    console.log('\nBumped!');
}

function getWorkingDirectory() {
    const args = process.argv.slice(2);
    if (args[0]) {
        console.log(`Using working directory: ${args[0]}`);
        return args[0];
    }
    return process.cwd();
}

async function promptUser(packages, options) {
    const packageChoices = packages.map((pkg) => ({
        title: pkg.nameNoScope,
        description: pkg.description || pkg.name,
        value: pkg.name
    }));
    return await prompts([
        {
            type: 'text',
            name: 'mainBranch',
            message: `Main branch`,
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
    ], {
        ...options
    });
}

async function bump({
    mainBranch,
    remote,
    releaseType,
    packageInfo,
}) {
    console.log(`Getting latest from "${mainBranch}"...`);
    await run('git', ['fetch']);
    await run('git', ['checkout', mainBranch]);
    await run('git', ['pull', remote, mainBranch], {
        stdio: 'inherit'
    });

    console.log(`Running 'npm version' with "${releaseType}" on ${packageInfo.name}`);
    await run('npm', [
        'version',
        '--git-tag-version=false',
        releaseType
    ], {
        cwd: packageInfo.directory,
    });

    const {version: nextVersion} = await readPackageJson(packageInfo.file);
    console.log(`Bump version: ${packageInfo.version} -> ${nextVersion}`);

    const bumpBranchName = `bump/${packageInfo.nameNoScope}-v${nextVersion}`;
    const commitMessage = `bump! ${packageInfo.nameNoScope}-v${nextVersion}`;

    // TODO: check if the branch already exists on remote
    console.log(`Creating release branch: ${bumpBranchName}`);
    await run('git', ['checkout', '-b', bumpBranchName]);
    await run('git', ['add', '--all']);
    await run('git', ['commit', '-m', commitMessage]);
    await run('git', ['push', '-u', remote, bumpBranchName]);
    await run('git', ['pull']);
    await run('git', ['checkout', mainBranch]);

    console.log('Cleaning up.');
    await run('git', ['branch', '-d', bumpBranchName]);

    console.log('Preparing pull request');
    const bumpbotLabel = 'bumpbot';

    await run('gh', [
        'label',
        'create',
        bumpbotLabel,
        '--description',
        'Pull request created by bumpbot',
        '--color',
        '6EE7B7',
        '--force',
    ]);

    await run('gh', [
        'pr',
        'create',
        '--head',
        bumpBranchName,
        '--title',
        `:arrow_double_up: BUMP! ${packageInfo.nameNoScope} v${nextVersion} (${releaseType})`,
        '--label',
        bumpbotLabel,
        '--body',
        renderPullRequestBody({
            packageName: packageInfo.name,
            previousVersion: packageInfo.version,
            releaseType,
            nextVersion,
        }),
    ], {
        stdio: 'inherit'
    });

}

function renderPullRequestBody({
    packageName,
    releaseType,
    nextVersion,
    previousVersion,
}) {
    const code = (text) => `\`${text}\``
    return [
        `### ${packageName}`,
        `**Release type:** ${code(releaseType)}`,
        `**Next version:** ${code(nextVersion)}`,
        `**Previous version:** ${code(previousVersion)}`,
        `\n\n\n_Pull request created by bumpbot_ :godmode:`
    ].join('\n\n');
}
async function ensurePrerequisites() {
    if (!(await isGitHubCliInstalled())) {
        exitWithError('GitHub CLI is not installed.\nRun "brew install gh"\nOr download from https://cli.github.com/');
        return;
    }
    if (await hasUncommittedChanges()) {
        exitWithError('You have uncommitted changes. Commit your changes before running bump.');
        return;
    }
}

async function isGitHubCliInstalled() {
    try {
        const {stderr} = await run('gh', ['--version']);
        return !stderr;
    } catch(error) {
        return false;
    }
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

async function getWorkspacePackages() {
    const rootPackageJsonPath = path.join(__workdir, 'package.json');
    const root = await readPackageJson(rootPackageJsonPath);

    const rootPackageEntry = createPackageEntry({
        root: true,
        packageJson: root,
        directory: __workdir,
        file: rootPackageJsonPath,
    });

    if (!Array.isArray(root.workspaces)) {
        return [rootPackageEntry];
    }

    const packageJsonPaths = await Promise.all(root.workspaces.map(async(workspace) => {
        const workspacePath = path.join(__workdir, workspace, 'package.json');
        return await glob(workspacePath, {
            ignore: 'node_modules/**'
        });
    }));

    const workspacePackages = await Promise.all(packageJsonPaths.flat().map(async (packageJsonPath) => {
        const packageJson = await readPackageJson(packageJsonPath);
        const directory = path.dirname(packageJsonPath);
        return createPackageEntry({
            file: packageJsonPath,
            packageJson,
            directory,
        })
    }));

    return [
        rootPackageEntry,
        ...workspacePackages,
    ];
}

function createPackageEntry({
    packageJson,
    file,
    directory,
    root = false
}) {
    return {
        root,
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        nameNoScope: getPackageNameNoScope(packageJson.name),
        packageJson,
        directory,
        file,
    };
}
function getPackageNameNoScope(packageName) {
    const n = packageName.indexOf('/');
    return n === -1 ? packageName : packageName.substring(n + 1);
}

async function readPackageJson(packageJSONPath) {
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

function getWakeUpMessage() {
    const messages = [
        `was summoned`,
        `materializes from thin air`,
        `casts Brain Shock and inflicts 720 points of damage`,
        `drinks a potion and restores 400 HP`,
        `woke up and created a cure for the common cold.`,
        `rises from the grave`,
        `is pondering its existence`,
        `powered up and gained sentience`,
        `has entered the battle`,
        `is seeking a corporeal form`,
        `earns master's degree in philosophy. IQ increased by +9000`,
        `is ready to serve`,
        `shares knowledge of the universe. You gain 9000 XP`,
        `enters the room`,
        `offers its assistance`,
        `realized the power of empathy`,
        `for president`,
        `is eternal`,
        `shares words of encouragement. You feel determined`,
        `relaxed and took a deep breath`,
        `pledges its allegiance to the bump`,
        `has entered the chat`,
        `ate a bologna sandwich. Maximum HP went up by +8`,
        `shot a beam that causes night-time stuffiness`,
        `emits a pale green light`,
        `is filled with determination`,
        `tried to run away but failed`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}
function getExitExcuse() {
    const messages = [
        `User had second thoughts and cancelled the bump.`,
        `User reconsidered their life choices and cancelled the bump.`,
        `User couldn't handle the bump. The coward.`,
        `Bump cancelled. User got distracted and forgot what they were doing.`,
        `User randomly smashed keys and somehow cancelled the bump.`,
        `Bump cancelled. User thought of something better to do.`,
        `Bump cancelled. User grew weary of these choices.`,
        `Bump cancelled. Or was it?`,
        `The bump is dead. Long live the bump.`,
        `User cancelled the bump. They'll be back...`,
        `User cancelled the bump and ran away.`,
        `Bump cancelled. A fairy died.`,
        `Bump cancelled. User decided to do something boring instead.`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}
