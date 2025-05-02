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
      peg$c4 = peg$literalExpectation("cursed", true),
      peg$c5 = peg$literalExpectation("Cursed", true),
      peg$c6 = function () {
    return {
      key: "cursed",
      value: text()
    };
  },
      peg$c7 = "desolate",
      peg$c8 = peg$literalExpectation("desolate", true),
      peg$c9 = peg$literalExpectation("Desolate", true),
      peg$c10 = function () {
    return {
      key: "desolate",
      value: text()
    };
  },
      peg$c11 = "haven",
      peg$c12 = peg$literalExpectation("haven", true),
      peg$c13 = peg$literalExpectation("Haven", true),
      peg$c14 = function () {
    return {
      key: "haven",
      value: text()
    };
  },
      peg$c15 = "occult",
      peg$c16 = peg$literalExpectation("occult", true),
      peg$c17 = peg$literalExpectation("Occult", true),
      peg$c18 = function () {
    return {
      key: "occult",
      value: text()
    };
  },
      peg$c19 = "religion",
      peg$c20 = peg$literalExpectation("religion", true),
      peg$c21 = peg$literalExpectation("Religion", true),
      peg$c22 = function () {
    return {
      key: "religion",
      value: text()
    };
  },
      peg$c23 = "technology",
      peg$c24 = peg$literalExpectation("technology", true),
      peg$c25 = peg$literalExpectation("Technology", true),
      peg$c26 = function () {
    return {
      key: "technology",
      value: text()
    };
  },
      peg$c27 = "warren",
      peg$c28 = peg$literalExpectation("warren", true),
      peg$c29 = peg$literalExpectation("Warren", true),
      peg$c30 = function () {
    return {
      key: "warren",
      value: text()
    };
  },
      peg$c31 = "wild",
      peg$c32 = peg$literalExpectation("wild", true),
      peg$c33 = peg$literalExpectation("Wild", true),
      peg$c34 = function () {
    return {
      key: "wild",
      value: text()
    };
  },
      peg$c35 = "compel",
      peg$c36 = peg$literalExpectation("compel", true),
      peg$c37 = peg$literalExpectation("Compel", true),
      peg$c38 = function () {
    return {
      key: "compel",
      value: text()
    };
  },
      peg$c39 = "delve",
      peg$c40 = peg$literalExpectation("delve", true),
      peg$c41 = peg$literalExpectation("Delve", true),
      peg$c42 = function () {
    return {
      key: "delve",
      value: text()
    };
  },
      peg$c43 = "discern",
      peg$c44 = peg$literalExpectation("discern", true),
      peg$c45 = peg$literalExpectation("Discern", true),
      peg$c46 = function () {
    return {
      key: "discern",
      value: text()
    };
  },
      peg$c47 = "endure",
      peg$c48 = peg$literalExpectation("endure", true),
      peg$c49 = peg$literalExpectation("Endure", true),
      peg$c50 = function () {
    return {
      key: "endure",
      value: text()
    };
  },
      peg$c51 = "kill",
      peg$c52 = peg$literalExpectation("kill", true),
      peg$c53 = peg$literalExpectation("Kill", true),
      peg$c54 = function () {
    return {
      key: "kill",
      value: text()
    };
  },
      peg$c55 = "evade",
      peg$c56 = peg$literalExpectation("evade", true),
      peg$c57 = peg$literalExpectation("Evade", true),
      peg$c58 = function () {
    return {
      key: "evade",
      value: text()
    };
  },
      peg$c59 = "hunt",
      peg$c60 = peg$literalExpectation("hunt", true),
      peg$c61 = peg$literalExpectation("Hunt", true),
      peg$c62 = function () {
    return {
      key: "hunt",
      value: text()
    };
  },
      peg$c63 = "mend",
      peg$c64 = peg$literalExpectation("mend", true),
      peg$c65 = peg$literalExpectation("Mend", true),
      peg$c66 = function () {
    return {
      key: "mend",
      value: text()
    };
  },
      peg$c67 = "sneak",
      peg$c68 = peg$literalExpectation("sneak", true),
      peg$c69 = peg$literalExpectation("Sneak", true),
      peg$c70 = function () {
    return {
      key: "sneak",
      value: text()
    };
  },
      peg$c71 = "mastery",
      peg$c72 = peg$literalExpectation("mastery", true),
      peg$c73 = peg$literalExpectation("Mastery", true),
      peg$c74 = "standard",
      peg$c75 = peg$literalExpectation("standard", true),
      peg$c76 = peg$literalExpectation("Standard", true),
      peg$c77 = function () {
    return {
      key: "standard",
      value: text()
    };
  },
      peg$c78 = "risky",
      peg$c79 = peg$literalExpectation("risky", true),
      peg$c80 = peg$literalExpectation("Risky", true),
      peg$c81 = function () {
    return {
      key: "risky",
      value: text()
    };
  },
      peg$c82 = "dangerous",
      peg$c83 = peg$literalExpectation("dangerous", true),
      peg$c84 = peg$literalExpectation("Dangerous", true),
      peg$c85 = function () {
    return {
      key: "dangerous",
      value: text()
    };
  },
      peg$c86 = peg$otherExpectation("whitespace"),
      peg$c87 = /^[ ]/,
      peg$c88 = peg$classExpectation([" "], false, false),
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

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c3) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c4);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c3) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c5);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c6();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDesolateTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c7) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c8);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c7) {
        s1 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c9);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c10();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseHavenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c11) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c12);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c11) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c13);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c14();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseOccultTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c15) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c16);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c15) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c17);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c18();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseReligionTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c19) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c20);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c19) {
        s1 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
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

  function peg$parseTechnologyTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 10).toLowerCase() === peg$c23) {
      s1 = input.substr(peg$currPos, 10);
      peg$currPos += 10;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c24);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 10).toLowerCase() === peg$c23) {
        s1 = input.substr(peg$currPos, 10);
        peg$currPos += 10;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c25);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c26();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWarrenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c27) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c28);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c27) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c29);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c30();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWildTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c31) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c32);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c31) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c33);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c34();
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

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c35) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c36);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c35) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c37);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c38();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDelveTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c39) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c40);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c39) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
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

  function peg$parseDiscernTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c43) {
      s1 = input.substr(peg$currPos, 7);
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c44);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c43) {
        s1 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c45);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c46();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseEndureTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c47) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c48);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c47) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c49);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c50();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseKillTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c51) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c52);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c51) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c53);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c54();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseEvadeTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c55) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c56);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c55) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c57);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c58();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseHuntTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c59) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c60);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c59) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
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

  function peg$parseMendTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c63) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c64);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c63) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c65);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c66();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseSneakTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c67) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c68);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c67) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c69);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c70();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseMasteryTerm() {
    var s0;

    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c71) {
      s0 = input.substr(peg$currPos, 7);
      peg$currPos += 7;
    } else {
      s0 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c72);
      }
    }

    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c71) {
        s0 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c73);
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

    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c74) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c75);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c74) {
        s1 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
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

  function peg$parseRiskyTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c78) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c79);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c78) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c80);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c81();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDangerousTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c82) {
      s1 = input.substr(peg$currPos, 9);
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c83);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c82) {
        s1 = input.substr(peg$currPos, 9);
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c84);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c85();
    }

    s0 = s1;
    return s0;
  }

  function peg$parse_() {
    var s0, s1;
    peg$silentFails++;
    s0 = [];

    if (peg$c87.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c88);
      }
    }

    while (s1 !== peg$FAILED) {
      s0.push(s1);

      if (peg$c87.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c88);
        }
      }
    }

    peg$silentFails--;

    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c86);
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