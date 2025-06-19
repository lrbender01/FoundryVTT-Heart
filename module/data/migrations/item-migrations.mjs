import { migrateLegacyItem } from "./common.mjs";

function migration000(source) {
    return migrateLegacyItem(source);
}

export default {
  "v0.10.3": migration000,
};
