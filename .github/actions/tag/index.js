import path from 'path';
import {EOL} from 'os';
import {execSync, spawn} from 'child_process';
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

    const foo = runSync(`git log -m -1 --name-only --pretty="format:" ${INPUT_SHA}`);
    console.log(foo);
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
