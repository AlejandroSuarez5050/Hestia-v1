import env from '../config/env.js';

const levels = ['debug', 'info', 'warn', 'error'];
const minIndex = levels.indexOf(env.logLevel) === -1 ? 1 : levels.indexOf(env.logLevel);

function canLog(level) {
  return levels.indexOf(level) >= minIndex;
}

function out(level, ...args) {
  if (!canLog(level)) return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  console.log(prefix, ...args);
}

export default {
  debug: (...args) => out('debug', ...args),
  info: (...args) => out('info', ...args),
  warn: (...args) => out('warn', ...args),
  error: (...args) => out('error', ...args),
};
