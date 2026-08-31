# Repository Instructions

## Local testing

After implementation, test the application with `pnpm run dev:local`.

Before starting it, check for processes listening on TCP port 8787 and terminate those exact process IDs so another Node.js server can bind to the port. Run the development command in a retained terminal session. After testing is complete, stop that session and confirm that no process from the test run remains listening on port 8787.
