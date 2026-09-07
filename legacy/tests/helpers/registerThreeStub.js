// Bootstrap file for `node --import`: registers the "three" stub loader
// hook (tests/helpers/threeStubLoader.js) before any test module imports
// frontend/js/*.js. See that file for why the stub exists.
//
// Usage:
//   node --import ./tests/helpers/registerThreeStub.js --test frontend/js/ui.test.mjs
//   node --import ./tests/helpers/registerThreeStub.js --test tests/test_frontend_logic.js

import { register } from "node:module";

register("./threeStubLoader.js", import.meta.url);
