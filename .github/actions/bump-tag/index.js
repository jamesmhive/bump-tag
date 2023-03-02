import core from '@actions/core';
import github from '@actions/github';
import path from 'path';
import {EOL} from 'os';
import {execSync, spawn} from 'child_process';
import {existsSync} from 'fs';
import {readFile} from 'fs/promises';

const ROOT_WORKSPACE = '<root>';

const $workspace = core.getInput('workspace');
const $release = core.getInput('release');
const $cwd = process.env.GITHUB_WORKSPACE;


try {
    await start();
} catch (error) {
    logError(error);
    core.setFailed(error.message);
}

async function start() {
    verifyReleaseType();

    const packageJsonDirectory = resolvePackageJsonDirectory();
    const packageJson = await getPackageJson(packageJsonDirectory);

    const currentVersion = packageJson.version;
    const packageNameNoScope = getPackageNameNoScope(packageJson);

    const context = github.context.payload;
    const currentBranch = context.ref.replace('refs/heads/', '');
    const userName = context.sender?.login || 'Automated Version Bump';

    console.log(`Creating "${$release}" release...`);
    console.log(`Package name = ${packageJson.name}`);
    console.log(`Package name no scope = ${packageNameNoScope}`);
    console.log(`Current version = ${currentVersion}`);
    console.log(`Branch = ${currentBranch}`);
    console.log(`Username = ${userName}`);

    await run('git', [
        'config',
        'user.name',
        `"${userName}"`
    ]);

    await run('git', [
        'config',
        'user.email',
        `'auto.version@users.noreply.github.com'`,
    ]);

    // bump and commit in the current checked out GitHub branch (DETACHED HEAD)
    // important for further usage of the package.json version in other jobs
    await run('npm', [
        'version',
        '--allow-same-version=true',
        '--git-tag-version=false',
        currentVersion
    ]);

    const cd = `cd ${packageJsonDirectory}`;
    const nextVersion = runSync(`${cd} && npm version --git-tag-version=false ${$release}`)
        .toString().trim().replace(/^v/, '');

    console.log(`Next version = ${nextVersion}`);

    const commitMessage = `bump ${packageNameNoScope}-v${nextVersion}`;
    await run('git', [
        'commit',
        '-a',
        '-m',
        commitMessage
    ]);

    // now go to the actual branch to perform the same versioning
    await run('git', [
        'checkout',
        currentBranch
    ]);

    await run('npm', [
        'version',
        '--allow-same-version=true',
        '--git-tag-version=false',
        currentVersion
    ]);

    runSync(`${cd} && npm version --git-tag-version=false ${$release}`);

    const tagName = `${packageNameNoScope}/v${nextVersion}`;
    console.log(`Creating tag "${tagName}"`);

    const repository = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    await run('git', ['fetch']);
    await run('git', ['checkout', currentBranch]);
    await run('git', ['tag', tagName]);
    await run('git', ['push', repository, '--follow-tags']);
    await run('git', ['push', repository, '--tags']);

    console.log('Done');
}

function resolvePackageJsonDirectory() {
    return $workspace === ROOT_WORKSPACE ? $cwd : path.resolve($cwd, $workspace);
}

async function getPackageJson(packageJsonDirectory) {
    const packageJsonPath = path.join(packageJsonDirectory, 'package.json');
    console.log(`Reading package from ${packageJsonPath}`);
    if (!existsSync(packageJsonPath)) {
        throw new Error('package.json could not be found');
    }
    const content = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    verifyPackageJson(packageJson);
    return packageJson;
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

function verifyReleaseType() {
    const allowedTypes = ['major', 'minor', 'patch'];
    if (!allowedTypes.includes($release)) {
        throw new Error(`Invalid release type "${$release}". Release must match ${allowedTypes.join('|')}`)
    }
}

function getPackageNameNoScope(packageJson) {
    const packageName = packageJson.name;
    const n = packageName.indexOf('/');
    return n === -1 ? packageName : packageName.substring(n + 1);
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        // console.log('spawn | command:', command, 'args:', args);
        const child = spawn(command, args, {cwd: $cwd});
        let isDone = false;
        const errorMessages = [];
        child.on('error', (error) => {
            if (!isDone) {
                isDone = true;
                reject(error);
            }
        });
        child.stderr.on('data', (chunk) => errorMessages.push(chunk));
        child.on('exit', (code) => {
            if (!isDone) {
                if (code === 0) {
                    resolve();
                } else {
                    reject(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`);
                }
            }
        });
    });
}

function runSync(command) {
    // console.log('spawn | command:', command);
    return execSync(command)
}

function logError(error) {
    console.error(`✖ ERROR \n${error.stack || error}`);
}
