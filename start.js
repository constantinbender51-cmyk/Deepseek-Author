const { exec, spawn } = require('child_process');
const path = require('path');

async function startApplication() {
    console.log('Step 1: Running book generation script...');

    const generationProcess = exec(`node ${path.join(__dirname, 'deepseek_api_call.js')}`);

    generationProcess.stdout.on('data', (data) => {
        console.log(`[GENERATOR]: ${data}`);
    });

    generationProcess.stderr.on('data', (data) => {
        console.error(`[GENERATOR ERROR]: ${data}`);
    });

    // Use a Promise to wait for the generation script to finish
    await new Promise((resolve, reject) => {
        generationProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Book generation completed successfully.');
                resolve();
            } else {
                console.error(`Book generation failed with code ${code}.`);
                reject(new Error(`Book generation failed with code ${code}.`));
            }
        });
    });

    console.log('Step 2: Starting the Express server...');

    const serverProcess = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'inherit' });

    serverProcess.on('error', (err) => {
        console.error('Failed to start server process:', err);
    });

    serverProcess.on('close', (code) => {
        if (code !== 0) {
            console.log(`Server process exited with code ${code}`);
        }
    });

    // Keep the main process alive while the server is running
    process.on('SIGINT', () => {
        console.log('Stopping server...');
        serverProcess.kill();
        process.exit();
    });
}

startApplication();

