import path from 'path';
import {spawn} from 'child_process';
import {existsSync} from 'fs';
import {readFile} from 'fs/promises';


const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const INPUT_SHA = process.env.INPUT_SHA;

try {
    await start();
} catch (error) {
    logError(error);
    process.exitCode = 1;
}

async function start() {
    console.log('start');
    console.log('GITHUB_WORKSPACE ', GITHUB_WORKSPACE);
    console.log('INPUT_SHA ', INPUT_SHA);

    const gitdiff = await run('git ', [
        'diff',
        '--name-only',
        `${INPUT_SHA}..${INPUT_SHA}~`
    ], {
        shell: true,
    });

    const filesChanged = gitdiff.stdout.split('\n');
    const packagesChanged = filesChanged.filter((change) => change.endsWith('package.json'));

    if (packagesChanged.length === 0) {
        throw new Error(`Commit ${INPUT_SHA} does not contain any changes to package.json`);
    }

    if (packagesChanged.length > 1) {
        throw new Error(`Commit ${INPUT_SHA} contains more than 1 package.json change`);
    }

    const changedPackage = packagesChanged[0].toString();
    console.log(`package.json changed = ${changedPackage}`);
    console.log(`full path = ${path.join(GITHUB_WORKSPACE, changedPackage)}`);

    const pkg = readJsonFile(path.join(GITHUB_WORKSPACE, changedPackage));
    console.log(`Package name = ${pkg.name}`);
    console.log(`Package version = ${pkg.version}`);
    console.log(`Package name no scope = ${getPackageNameNoScope(pkg.name)}`);
}

async function readJsonFile(filePath) {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

function getPackageNameNoScope(packageName) {
    const n = packageName.indexOf('/');
    return n === -1 ? packageName : packageName.substring(n + 1);
}

function run(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd: GITHUB_WORKSPACE, ...options});
        let childDidError = false;
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
        child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
        const stdoutAsString = () => stdout.join('\n').trim();
        const stderrAsString = () => stderr.join('\n').trim();
        child.on('error', (error) => {
            if (!childDidError) {
                childDidError = true;
                console.log(stdoutAsString());
                console.error(stderrAsString());
                reject(error);
            }
        });
        child.on('exit', (exitCode) => {
            if (!childDidError) {
                if (exitCode === 0) {
                    resolve({stdout: stdoutAsString()});
                } else {
                    console.log(stdoutAsString());
                    reject(new Error(`${command} exited with code ${exitCode}: \n ${stderrAsString()}`));
                }
            }
        });
    });
}

function logError(error) {
    console.error(`✖ ERROR \n${error.stack || error}`);
}
