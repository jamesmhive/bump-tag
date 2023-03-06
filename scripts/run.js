import {spawn} from 'child_process';

const GITHUB_WORKSPACE = process.cwd();

try {
    void await main();
} catch(error) {
    console.error(error);
    process.exit(1);
}

async function main() {

    const {stdout: stdout1} = await run('git', ['--version']);
    console.log(`> ${stdout1}`);


    const {stdout: stdout2} = await run('git', ['--ver']);
    console.log(`> ${stdout2}`);


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
            console.log(child);
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
