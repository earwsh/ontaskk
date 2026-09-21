const { spawn } = require('child_process');
const http = require('http');

console.log('Spawning backend...');
const backend = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: '/home/earwsh/app/task-on/backend',
  stdio: 'inherit'
});

console.log('Spawning frontend...');
const frontend = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', '3000'], {
  cwd: '/home/earwsh/app/task-on/frontend-next',
  stdio: 'inherit'
});

backend.on('exit', (code) => console.log('Backend exited with code', code));
frontend.on('exit', (code) => console.log('Frontend exited with code', code));

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});
