const crypto = require('crypto');

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i/l — avoids ambiguous chars

function randomGroup(length) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

// Short, human-relayable temp password/reset code, e.g. "xk4t-9wqm".
// Never persisted in plaintext — callers hand it straight to `new User({password})`
// (or an equivalent save that re-triggers the pre-save bcrypt hook) and return
// this value to the caller exactly once.
function generateTempPassword() {
  return `${randomGroup(4)}-${randomGroup(4)}`;
}

module.exports = { generateTempPassword };
