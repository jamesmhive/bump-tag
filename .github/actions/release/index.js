import core from '@actions/core';
import github from '@actions/github';
import path from 'path';
import {existsSync} from 'fs';
import {readFile} from 'fs/promises';

const $workspacesDir = core.getInput('workspaces-dir');
const $workspace = core.getInput('workspace');
const $release = core.getInput('release');
const $workspaceDir = path.resolve(process.env.GITHUB_WORKSPACE, $workspacesDir, $workspace);

printArgs();

try {
    await run();
} catch (error) {
    core.setFailed(error.message);
}

async function run() {
    const packageJson = getPackageJson();
    console.log('package.json version ', packageJson.version);
}

function printArgs() {
    console.log(JSON.stringify({
        $workspacesDir,
        $workspace,
        $release,
        $workspaceDir,
    }, null, 2))
}
async function getPackageJson() {
    const packageJsonPath = path.join($workspaceDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
        throw new Error('package.json could not be found in workspace.');
    }
    const content = await readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
}

// console.log(`release = ${release}`);
// console.log(`GITHUB_WORKSPACE = ${process.env.GITHUB_WORKSPACE}`);
// const time = (new Date()).toTimeString();
// core.setOutput("time", time);
// // Get the JSON webhook payload for the event that triggered the workflow
// const payload = JSON.stringify(github.context.payload, undefined, 2)
// console.log(`The event payload: ${payload}`);
