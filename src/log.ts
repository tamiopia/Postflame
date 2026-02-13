// @ts-nocheck
import kleur from 'kleur';

const isTty = process.stdout.isTTY;

function info(message) {
  if (isTty) {
    console.log(kleur.cyan(message));
  } else {
    console.log(message);
  }
}

function warn(message) {
  if (isTty) {
    console.warn(kleur.yellow(message));
  } else {
    console.warn(message);
  }
}

function error(message) {
  if (isTty) {
    console.error(kleur.red(message));
  } else {
    console.error(message);
  }
}

function success(message) {
  if (isTty) {
    console.log(kleur.green(message));
  } else {
    console.log(message);
  }
}

export { info, warn, error, success };
