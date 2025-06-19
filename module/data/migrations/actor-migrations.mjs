import { migrateLegacyActor } from "./common.mjs";

function migration0103(source) {
    return migrateLegacyActor(source);
}

export default {
  "v0.10.3": migration0103,
};
