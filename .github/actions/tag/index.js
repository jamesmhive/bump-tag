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

    const gitfetch = await run('git', ['fetch']);
    console.log(`fetch > ${gitfetch.stdout}`);

    const gitdiff = await run('git ', [
        'diff',
        '--name-only',
        `${INPUT_SHA}..${INPUT_SHA}~`
    ], {
        shell: true,
    });

    console.log(gitdiff.stdout);
}

async function getPackageJson(packageJsonDirectory) {
    const packageJsonPath = path.join(GITHUB_WORKSPACE, 'package.json');
    console.log(`Reading package from ${packageJsonPath}`);
    if (!existsSync(packageJsonPath)) {
        throw new Error('package.json could not be found');
    }
    const content = await readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
}

function getPackageNameNoScope(packageJson) {
    const packageName = packageJson.name;
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
