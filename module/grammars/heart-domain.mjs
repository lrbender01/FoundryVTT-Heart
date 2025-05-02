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
      peg$c0 = function (domain) {
    return {
      domain,
      text: text(),
      error
    };
  },
      peg$c1 = "cursed",
      peg$c2 = peg$literalExpectation("cursed", true),
      peg$c3 = peg$literalExpectation("Cursed", true),
      peg$c4 = function () {
    return {
      key: "cursed",
      value: text()
    };
  },
      peg$c5 = "desolate",
      peg$c6 = peg$literalExpectation("desolate", true),
      peg$c7 = peg$literalExpectation("Desolate", true),
      peg$c8 = function () {
    return {
      key: "desolate",
      value: text()
    };
  },
      peg$c9 = "haven",
      peg$c10 = peg$literalExpectation("haven", true),
      peg$c11 = peg$literalExpectation("Haven", true),
      peg$c12 = function () {
    return {
      key: "haven",
      value: text()
    };
  },
      peg$c13 = "occult",
      peg$c14 = peg$literalExpectation("occult", true),
      peg$c15 = peg$literalExpectation("Occult", true),
      peg$c16 = function () {
    return {
      key: "occult",
      value: text()
    };
  },
      peg$c17 = "religion",
      peg$c18 = peg$literalExpectation("religion", true),
      peg$c19 = peg$literalExpectation("Religion", true),
      peg$c20 = function () {
    return {
      key: "religion",
      value: text()
    };
  },
      peg$c21 = "technology",
      peg$c22 = peg$literalExpectation("technology", true),
      peg$c23 = peg$literalExpectation("Technology", true),
      peg$c24 = function () {
    return {
      key: "technology",
      value: text()
    };
  },
      peg$c25 = "warren",
      peg$c26 = peg$literalExpectation("warren", true),
      peg$c27 = peg$literalExpectation("Warren", true),
      peg$c28 = function () {
    return {
      key: "warren",
      value: text()
    };
  },
      peg$c29 = "wild",
      peg$c30 = peg$literalExpectation("wild", true),
      peg$c31 = peg$literalExpectation("Wild", true),
      peg$c32 = function () {
    return {
      key: "wild",
      value: text()
    };
  },
      peg$c33 = peg$otherExpectation("whitespace"),
      peg$c34 = /^[ ]/,
      peg$c35 = peg$classExpectation([" "], false, false),
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
    var s0, s1, s2, s3;
    s0 = peg$currPos;
    s1 = peg$parse_();

    if (s1 !== peg$FAILED) {
      s2 = peg$parseDomainTerm();

      if (s2 === peg$FAILED) {
        s2 = null;
      }

      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();

        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c0(s2);
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

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c1) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c2);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c1) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c3);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c4();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseDesolateTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c5) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c6);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c5) {
        s1 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c7);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c8();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseHavenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c9) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c10);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c9) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
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

  function peg$parseOccultTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c13) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c14);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c13) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c15);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c16();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseReligionTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c17) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c18);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c17) {
        s1 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c19);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c20();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseTechnologyTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 10).toLowerCase() === peg$c21) {
      s1 = input.substr(peg$currPos, 10);
      peg$currPos += 10;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c22);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 10).toLowerCase() === peg$c21) {
        s1 = input.substr(peg$currPos, 10);
        peg$currPos += 10;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c23);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c24();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWarrenTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c25) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c26);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c25) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c27);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c28();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseWildTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c29) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c30);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c29) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
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

  function peg$parse_() {
    var s0, s1;
    peg$silentFails++;
    s0 = [];

    if (peg$c34.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c35);
      }
    }

    while (s1 !== peg$FAILED) {
      s0.push(s1);

      if (peg$c34.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c35);
        }
      }
    }

    peg$silentFails--;

    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c33);
      }
    }

    return s0;
  }

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