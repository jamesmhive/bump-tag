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

    const {stdout} = await run('git', [
        'log',
        '-m',
        '-1',
        '--name-only',
        '--pretty="format:"',
        INPUT_SHA
    ]);

    console.log(stdout);
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

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd: GITHUB_WORKSPACE});
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
                    resolve({
                        exitCode: code,
                        stderr: child.stderr,
                        stdout: child.stdout,
                    });
                } else {
                    reject(new Error(`${command} command exited with code ${code}`));
                }
            }
        });
    });
}

function logError(error) {
    console.error(`✖ ERROR \n${error.stack || error}`);
}
