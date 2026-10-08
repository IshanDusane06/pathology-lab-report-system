const { ROLES } = require('../middleware/auth');

// The one place the access rule lives:
//   "Admin can see all of the report who send to who. Doctor and technicians
//    can just see their report who they send or downloaded."
//
// A non-Admin asking for scope=everyone is silently narrowed to their own
// rows and told so via scopeForced — never 403'd. Seeing only your own work
// isn't an error condition, and a 403 would make a perfectly legitimate
// default request look like a permissions failure.
function resolveScope(req) {
  const isAdmin = req.user.role === ROLES.ADMIN;
  const requested = req.query.scope === 'mine' ? 'mine' : 'everyone';
  const scope = isAdmin ? requested : 'mine';

  return {
    isAdmin,
    scope,
    scopeForced: !isAdmin && requested === 'everyone',
    filter: scope === 'mine' ? { 'actor.userId': req.user._id } : {},
  };
}

module.exports = { resolveScope };
