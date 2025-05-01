function peg$subclass(child, parent) {
  function ctor() {
    this.constructor = child;
  }

  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message = message;
  this.expected = expected;
  this.found = found;
  this.location = location;
  this.name = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function (expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
    literal: function (expectation) {
      return "\"" + literalEscape(expectation.text) + "\"";
    },
    "class": function (expectation) {
      var escapedParts = "",
          i;

      for (i = 0; i < expectation.parts.length; i++) {
        escapedParts += expectation.parts[i] instanceof Array ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1]) : classEscape(expectation.parts[i]);
      }

      return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
    },
    any: function (expectation) {
      return "any character";
    },
    end: function (expectation) {
      return "end of input";
    },
    other: function (expectation) {
      return expectation.description;
    }
  };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\0/g, '\\0').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/[\x00-\x0F]/g, function (ch) {
      return '\\x0' + hex(ch);
    }).replace(/[\x10-\x1F\x7F-\x9F]/g, function (ch) {
      return '\\x' + hex(ch);
    });
  }

  function classEscape(s) {
    return s.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\^/g, '\\^').replace(/-/g, '\\-').replace(/\0/g, '\\0').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/[\x00-\x0F]/g, function (ch) {
      return '\\x0' + hex(ch);
    }).replace(/[\x10-\x1F\x7F-\x9F]/g, function (ch) {
      return '\\x' + hex(ch);
    });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i,
        j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }

      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},
      peg$startRuleFunctions = {
    Expression: peg$parseExpression
  },
      peg$startRuleFunction = peg$parseExpression,
      peg$c0 = function (difficulty, domain, skill, has_mastery) {
    return parser._onExpression(domain, skill, has_mastery, difficulty, text(), error);
  },
      peg$c1 = "+",
      peg$c2 = peg$literalExpectation("+", false),
      peg$c3 = "cursed",
      peg$c4 = peg$literalExpectation("cursed", false),
      peg$c5 = "Cursed",
      peg$c6 = peg$literalExpectation("Cursed", false),
      peg$c7 = function () {
    return {
      key: "cursed",
      value: text()
    };
  },
      peg$c8 = "desolate",
      peg$c9 = peg$literalExpectation("desolate", false),
      peg$c10 = "Desolate",
      peg$c11 = peg$literalExpectation("Desolate", false),
      peg$c12 = function () {
    return {
      key: "desolate",
      value: text()
    };
  },
      peg$c13 = "haven",
      peg$c14 = peg$literalExpectation("haven", false),
      peg$c15 = "Haven",
      peg$c16 = peg$literalExpectation("Haven", false),
      peg$c17 = function () {
    return {
      key: "haven",
      value: text()
    };
  },
      peg$c18 = "occult",
      peg$c19 = peg$literalExpectation("occult", false),
      peg$c20 = "Occult",
      peg$c21 = peg$literalExpectation("Occult", false),
      peg$c22 = function () {
    return {
      key: "occult",
      value: text()
    };
  },
      peg$c23 = "religion",
      peg$c24 = peg$literalExpectation("religion", false),
      peg$c25 = "Religion",
      peg$c26 = peg$literalExpectation("Religion", false),
      peg$c27 = function () {
    return {
      key: "religion",
      value: text()
    };
  },
      peg$c28 = "technology",
      peg$c29 = peg$literalExpectation("technology", false),
      peg$c30 = "Technology",
      peg$c31 = peg$literalExpectation("Technology", false),
      peg$c32 = function () {
    return {
      key: "technology",
      value: text()
    };
  },
      peg$c33 = "warren",
      peg$c34 = peg$literalExpectation("warren", false),
      peg$c35 = "Warren",
      peg$c36 = peg$literalExpectation("Warren", false),
      peg$c37 = function () {
    return {
      key: "warren",
      value: text()
    };
  },
      peg$c38 = "wild",
      peg$c39 = peg$literalExpectation("wild", false),
      peg$c40 = "Wild",
      peg$c41 = peg$literalExpectation("Wild", false),
      peg$c42 = function () {
    return {
      key: "wild",
      value: text()
    };
  },
      peg$c43 = "compel",
      peg$c44 = peg$literalExpectation("compel", false),
      peg$c45 = "Compel",
      peg$c46 = peg$literalExpectation("Compel", false),
      peg$c47 = function () {
    return {
      key: "compel",
      value: text()
    };
  },
      peg$c48 = "delve",
      peg$c49 = peg$literalExpectation("delve", false),
      peg$c50 = "Delve",
      peg$c51 = peg$literalExpectation("Delve", false),
      peg$c52 = function () {
    return {
      key: "delve",
      value: text()
    };
  },
      peg$c53 = "discern",
      peg$c54 = peg$literalExpectation("discern", false),
      peg$c55 = "Discern",
      peg$c56 = peg$literalExpectation("Discern", false),
      peg$c57 = function () {
    return {
      key: "discern",
      value: text()
    };
  },
      peg$c58 = "endure",
      peg$c59 = peg$literalExpectation("endure", false),
      peg$c60 = "Endure",
      peg$c61 = peg$literalExpectation("Endure", false),
      peg$c62 = function () {
    return {
      key: "endure",
      value: text()
    };
  },
      peg$c63 = "kill",
      peg$c64 = peg$literalExpectation("kill", false),
      peg$c65 = "Kill",
      peg$c66 = peg$literalExpectation("Kill", false),
      peg$c67 = function () {
    return {
      key: "kill",
      value: text()
    };
  },
      peg$c68 = "evade",
      peg$c69 = peg$literalExpectation("evade", false),
      peg$c70 = "Evade",
      peg$c71 = peg$literalExpectation("Evade", false),
      peg$c72 = function () {
    return {
      key: "evade",
      value: text()
    };
  },
      peg$c73 = "hunt",
      peg$c74 = peg$literalExpectation("hunt", false),
      peg$c75 = "Hunt",
      peg$c76 = peg$literalExpectation("Hunt", false),
      peg$c77 = function () {
    return {
      key: "hunt",
      value: text()
    };
  },
      peg$c78 = "mend",
      peg$c79 = peg$literalExpectation("mend", false),
      peg$c80 = "Mend",
      peg$c81 = peg$literalExpectation("Mend", false),
      peg$c82 = function () {
    return {
      key: "mend",
      value: text()
    };
  },
      peg$c83 = "sneak",
      peg$c84 = peg$literalExpectation("sneak", false),
      peg$c85 = "Sneak",
      peg$c86 = peg$literalExpectation("Sneak", false),
      peg$c87 = function () {
    return {
      key: "sneak",
      value: text()
    };
  },
      peg$c88 = "mastery",
      peg$c89 = peg$literalExpectation("mastery", false),
      peg$c90 = "Mastery",
      peg$c91 = peg$literalExpectation("Mastery", false),
      peg$c92 = "standard",
      peg$c93 = peg$literalExpectation("standard", false),
      peg$c94 = "Standard",
      peg$c95 = peg$literalExpectation("Standard", false),
      peg$c96 = function () {
    return {
      key: "standard",
      value: text()
    };
  },
      peg$c97 = "risky",
      peg$c98 = peg$literalExpectation("risky", false),
      peg$c99 = "Risky",
      peg$c100 = peg$literalExpectation("Risky", false),
      peg$c101 = function () {
    return {
      key: "risky",
      value: text()
    };
  },
      peg$c102 = "dangerous",
      peg$c103 = peg$literalExpectation("dangerous", false),
      peg$c104 = "Dangerous",
      peg$c105 = peg$literalExpectation("Dangerous", false),
      peg$c106 = function () {
    return {
      key: "dangerous",
      value: text()
    };
  },
      peg$c107 = peg$otherExpectation("whitespace"),
      peg$c108 = /^[ ]/,
      peg$c109 = peg$classExpectation([" "], false, false),
      peg$currPos = 0,
      peg$savedPos = 0,
      peg$posDetailsCache = [{
    line: 1,
    column: 1
  }],
      peg$maxFailPos = 0,
      peg$maxFailExpected = [],
      peg$silentFails = 0,
      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos);
    throw peg$buildStructuredError([peg$otherExpectation(description)], input.substring(peg$savedPos, peg$currPos), location);
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos);
    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return {
      type: "literal",
      text: text,
      ignoreCase: ignoreCase
    };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return {
      type: "class",
      parts: parts,
      inverted: inverted,
      ignoreCase: ignoreCase
    };
  }

  function peg$anyExpectation() {
    return {
      type: "any"
    };
  }

  function peg$endExpectation() {
    return {
      type: "end"
    };
  }

  function peg$otherExpectation(description) {
    return {
      type: "other",
      description: description
    };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos],
        p;

    if (details) {
      return details;
    } else {
      p = pos - 1;

      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line: details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails = peg$computePosDetails(endPos);
    return {
      start: {
        offset: startPos,
        line: startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line: endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) {
      return;
    }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(peg$SyntaxError.buildMessage(expected, found), expected, found, location);
  }

  function peg$parseExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13;
    s0 = peg$currPos;
    s1 = peg$parse_();

    if (s1 !== peg$FAILED) {
      s2 = peg$parseDifficultyTerm();

      if (s2 === peg$FAILED) {
        s2 = null;
      }

      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();

        if (s3 !== peg$FAILED) {
          s4 = peg$parseDomainTerm();

          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();

            if (s5 !== peg$FAILED) {
              s6 = peg$parseJoinTerm();

              if (s6 !== peg$FAILED) {
                s7 = peg$parse_();

                if (s7 !== peg$FAILED) {
                  s8 = peg$parseSkillTerm();

                  if (s8 !== peg$FAILED) {
                    s9 = peg$currPos;
                    s10 = peg$parse_();

                    if (s10 !== peg$FAILED) {
                      s11 = peg$parseJoinTerm();

                      if (s11 !== peg$FAILED) {
                        s12 = peg$parse_();

                        if (s12 !== peg$FAILED) {
                          s13 = peg$parseMasteryTerm();

                          if (s13 !== peg$FAILED) {
                            s10 = [s10, s11, s12, s13];
                            s9 = s10;
                          } else {
                            peg$currPos = s9;
                            s9 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s9;
                          s9 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }

                    if (s9 === peg$FAILED) {
                      s9 = null;
                    }

                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();

                      if (s10 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c0(s2, s4, s8, s9);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseJoinTerm() {
    var s0;

    if (input.charCodeAt(peg$currPos) === 43) {
      s0 = peg$c1;
      peg$currPos++;
    } else {
      s0 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c2);
      }
    }

    return s0;
  }

  function peg$parseDomainTerm() {
    var s0;
    s0 = peg$parseCursedTerm();

    if (s0 === peg$FAILED) {
      s0 = peg$parseDesolateTerm();

      if (s0 === peg$FAILED) {
        s0 = peg$parseHavenTerm();

        if (s0 === peg$FAILED) {
          s0 = peg$parseOccultTerm();

          if (s0 === peg$FAILED) {
            s0 = peg$parseReligionTerm();

            if (s0 === peg$FAILED) {
              s0 = peg$parseTechnologyTerm();

              if (s0 === peg$FAILED) {
                s0 = peg$parseWarrenTerm();

                if (s0 === peg$FAILED) {
                  s0 = peg$parseWildTerm();
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseCursedTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6) === peg$c3) {
      s1 = peg$c3;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c4);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c5) {
        s1 = peg$c5;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c6);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c7();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDesolateTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8) === peg$c8) {
      s1 = peg$c8;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c9);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c10) {
        s1 = peg$c10;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c11);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c12();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseHavenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c13) {
      s1 = peg$c13;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c14);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c15) {
        s1 = peg$c15;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c16);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c17();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseOccultTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6) === peg$c18) {
      s1 = peg$c18;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c19);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c20) {
        s1 = peg$c20;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c21);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c22();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseReligionTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8) === peg$c23) {
      s1 = peg$c23;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c24);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c25) {
        s1 = peg$c25;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c26);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c27();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseTechnologyTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 10) === peg$c28) {
      s1 = peg$c28;
      peg$currPos += 10;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c29);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 10) === peg$c30) {
        s1 = peg$c30;
        peg$currPos += 10;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c31);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c32();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWarrenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6) === peg$c33) {
      s1 = peg$c33;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c34);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c35) {
        s1 = peg$c35;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c36);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c37();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWildTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c38) {
      s1 = peg$c38;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c39);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c40) {
        s1 = peg$c40;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c41);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c42();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseSkillTerm() {
    var s0;
    s0 = peg$parseCompelTerm();

    if (s0 === peg$FAILED) {
      s0 = peg$parseDelveTerm();

      if (s0 === peg$FAILED) {
        s0 = peg$parseDiscernTerm();

        if (s0 === peg$FAILED) {
          s0 = peg$parseEndureTerm();

          if (s0 === peg$FAILED) {
            s0 = peg$parseKillTerm();

            if (s0 === peg$FAILED) {
              s0 = peg$parseEvadeTerm();

              if (s0 === peg$FAILED) {
                s0 = peg$parseHuntTerm();

                if (s0 === peg$FAILED) {
                  s0 = peg$parseMendTerm();

                  if (s0 === peg$FAILED) {
                    s0 = peg$parseSneakTerm();
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseCompelTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6) === peg$c43) {
      s1 = peg$c43;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c44);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c45) {
        s1 = peg$c45;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c46);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c47();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDelveTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c48) {
      s1 = peg$c48;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c49);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c50) {
        s1 = peg$c50;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c51);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c52();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDiscernTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 7) === peg$c53) {
      s1 = peg$c53;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c54);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c55) {
        s1 = peg$c55;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c56);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c57();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseEndureTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6) === peg$c58) {
      s1 = peg$c58;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c59);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6) === peg$c60) {
        s1 = peg$c60;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c61);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c62();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseKillTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c63) {
      s1 = peg$c63;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c64);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c65) {
        s1 = peg$c65;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c66);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c67();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseEvadeTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c68) {
      s1 = peg$c68;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c69);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c70) {
        s1 = peg$c70;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c71);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c72();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseHuntTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c73) {
      s1 = peg$c73;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c74);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c75) {
        s1 = peg$c75;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c76);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c77();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseMendTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c78) {
      s1 = peg$c78;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c79);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c80) {
        s1 = peg$c80;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c81);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c82();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseSneakTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c83) {
      s1 = peg$c83;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c84);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c85) {
        s1 = peg$c85;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c86);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c87();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseMasteryTerm() {
    var s0;

    if (input.substr(peg$currPos, 7) === peg$c88) {
      s0 = peg$c88;
      peg$currPos += 7;
    } else {
      s0 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c89);
      }
    }

    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c90) {
        s0 = peg$c90;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c91);
        }
      }
    }

    return s0;
  }

  function peg$parseDifficultyTerm() {
    var s0;
    s0 = peg$parseStandardTerm();

    if (s0 === peg$FAILED) {
      s0 = peg$parseRiskyTerm();

      if (s0 === peg$FAILED) {
        s0 = peg$parseDangerousTerm();
      }
    }

    return s0;
  }

  function peg$parseStandardTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8) === peg$c92) {
      s1 = peg$c92;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c93);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c94) {
        s1 = peg$c94;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c95);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c96();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseRiskyTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c97) {
      s1 = peg$c97;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c98);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c99) {
        s1 = peg$c99;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c100);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c101();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDangerousTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 9) === peg$c102) {
      s1 = peg$c102;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c103);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 9) === peg$c104) {
        s1 = peg$c104;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c105);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c106();
    }

    s0 = s1;
    return s0;
  }

  function peg$parse_() {
    var s0, s1;
    peg$silentFails++;
    s0 = [];

    if (peg$c108.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c109);
      }
    }

    while (s1 !== peg$FAILED) {
      s0.push(s1);

      if (peg$c108.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c109);
        }
      }
    }

    peg$silentFails--;

    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c107);
      }
    }

    return s0;
  }

  const Parser = options.parser ?? CONFIG.HEART.heart_roll_parser;
  const parser = new Parser(input);
  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(peg$maxFailExpected, peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null, peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos));
  }
}

export default {
  SyntaxError: peg$SyntaxError,
  parse: peg$parse
};