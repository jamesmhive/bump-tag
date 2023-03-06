import {spawn} from 'child_process';

const GITHUB_WORKSPACE = process.cwd();
const INPUT_SHA = '64c0a6ac230f172236bd0d1ac25261e66a868d04';

try {
    void await main();
} catch(error) {
    console.error(error);
    process.exit(1);
}

async function main() {

    const {stdout: versionout} = await run('git', ['--version']);
    console.log(`> ${versionout}`);

    const {stdout: fetchout} = await run('git', ['fetch']);
    console.log(`> ${fetchout}`);

    const {stdout: pullout} = await run('git', ['pull']);
    console.log(`> ${pullout}`);

    const {stdout: diff} = await run('git ', [
        'diff',
        '--name-only',
        `${INPUT_SHA}..${INPUT_SHA}~`
    ], {
        shell: true,
    });

    console.log(`> ${diff}`);
}

function run(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd: GITHUB_WORKSPACE, ...options});
        let childDidError = false;
        const stdout = [];
        const stderr = [];
        const stdoutAsString = () => stdout.join('\n').trim();
        const stderrAsString = () => stderr.join('\n').trim();
        child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
        child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
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
