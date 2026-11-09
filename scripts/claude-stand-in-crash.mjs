// Part 9: a stand-in for `claude` that fails the way a crashed worker does: no stream, no result event,
// exit code 1. `npm run fix-issues -- --worker-stand-in crash` uses it to show the worker-error stop
// without spending seat money. It ignores its arguments and never calls Claude.
process.stderr.write("claude stand-in: simulated crash before any result event (npm run fix-issues --worker-stand-in crash)\n");
process.exit(1);
