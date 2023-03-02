import core from '@actions/core';
import github from '@actions/github';
import path from 'path';
import {EOL} from 'os';
import {execSync, spawn} from 'child_process';
import {existsSync} from 'fs';
import {readFile} from 'fs/promises';

const $workspacesDir = core.getInput('workspaces-dir');
const $workspace = core.getInput('workspace');
const $release = core.getInput('release');
const $cwd = process.env.GITHUB_WORKSPACE;
const $workspaceDir = path.resolve($cwd, $workspacesDir, $workspace);

try {
    await start();
} catch (error) {
    logError(error);
    core.setFailed(error.message);
}

async function start() {
    verifyReleaseType();

    const context = github.context.payload;
    const packageJson = await getPackageJson();
    const currentVersion = packageJson.version;

    const currentBranch = context.ref.replace('refs/heads/', '');
    const userName = context.sender?.login || 'Automated Version Bump';

    console.log(`Creating "${$release}" release...`);
    console.log(`Package name = ${packageJson.name}`);
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
        `'auto-release@users.noreply.github.com'`,
    ]);

    // bump and commit in the current checked out GitHub branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await run('npm', [
        'version',
        '--allow-same-version=true',
        '--git-tag-version=false',
        currentVersion
    ]);

    const cd = `cd ${$workspaceDir}`;
    const nextVersion = runSync(`${cd} && npm version --git-tag-version=false ${$release}`)
        .toString().trim().replace(/^v/, '');

    console.log(`Next version = ${nextVersion}`);

    const commitMessage = `bump ${packageJson.name}-v${nextVersion}`;
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

    const tagName = `${$workspace}-v${nextVersion}`;
    console.log(`Creating tag "${tagName}"`);

    const repository = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    await run('git', ['fetch']);
    await run('git', ['checkout', currentBranch]);
    await run('git', ['tag', tagName]);
    await run('git', ['push', repository, '--follow-tags']);
    await run('git', ['push', repository, '--tags']);

    console.log('here');
}

async function getPackageJson() {
    const packageJsonPath = path.join($workspaceDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
        throw new Error('package.json could not be found in workspace.');
    }
    console.log(`Reading package from ${packageJsonPath}`);
    const content = await readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
}

function verifyReleaseType() {
    const allowedTypes = ['major', 'minor', 'patch'];
    if (!allowedTypes.includes($release)) {
        throw new Error(`Invalid release type "${$release}"`)
    }
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
    console.error(`✖ ERROR\n ${error.stack || error}`);
}

// console.log(`release = ${release}`);
// console.log(`GITHUB_WORKSPACE = ${process.env.GITHUB_WORKSPACE}`);
// const time = (new Date()).toTimeString();
// core.setOutput("time", time);
// // Get the JSON webhook payload for the event that triggered the workflow
// const payload = JSON.stringify(github.context.payload, undefined, 2)
// console.log(`The event payload: ${payload}`);
