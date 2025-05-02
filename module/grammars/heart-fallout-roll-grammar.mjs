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
      peg$c0 = function (resistance) {
    return parser._onExpression(resistance, text(), error);
  },
      peg$c1 = "fallout",
      peg$c2 = peg$literalExpectation("fallout", false),
      peg$c3 = "blood",
      peg$c4 = peg$literalExpectation("blood", false),
      peg$c5 = "Blood",
      peg$c6 = peg$literalExpectation("Blood", false),
      peg$c7 = function () {
    return {
      key: "blood",
      value: text()
    };
  },
      peg$c8 = "echo",
      peg$c9 = peg$literalExpectation("echo", false),
      peg$c10 = "Echo",
      peg$c11 = peg$literalExpectation("Echo", false),
      peg$c12 = function () {
    return {
      key: "echo",
      value: text()
    };
  },
      peg$c13 = "fortune",
      peg$c14 = peg$literalExpectation("fortune", false),
      peg$c15 = "Fortune",
      peg$c16 = peg$literalExpectation("Fortune", false),
      peg$c17 = "mind",
      peg$c18 = peg$literalExpectation("mind", false),
      peg$c19 = "Mind",
      peg$c20 = peg$literalExpectation("Mind", false),
      peg$c21 = function () {
    return {
      key: "mind",
      value: text()
    };
  },
      peg$c22 = "supplies",
      peg$c23 = peg$literalExpectation("supplies", false),
      peg$c24 = "Supplies",
      peg$c25 = peg$literalExpectation("Supplies", false),
      peg$c26 = function () {
    return {
      key: "supplies",
      value: text()
    };
  },
      peg$c27 = peg$otherExpectation("whitespace"),
      peg$c28 = /^[ ]/,
      peg$c29 = peg$classExpectation([" "], false, false),
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
    var s0, s1, s2, s3, s4, s5;
    s0 = peg$currPos;
    s1 = peg$parse_();

    if (s1 !== peg$FAILED) {
      s2 = peg$parseResistanceTerm();

      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();

        if (s3 !== peg$FAILED) {
          s4 = peg$parseFalloutTerm();

          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();

            if (s5 !== peg$FAILED) {
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

  function peg$parseFalloutTerm() {
    var s0;

    if (input.substr(peg$currPos, 7) === peg$c1) {
      s0 = peg$c1;
      peg$currPos += 7;
    } else {
      s0 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c2);
      }
    }

    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c1) {
        s0 = peg$c1;
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c2);
        }
      }
    }

    return s0;
  }

  function peg$parseResistanceTerm() {
    var s0;
    s0 = peg$parseBloodTerm();

    if (s0 === peg$FAILED) {
      s0 = peg$parseEchoTerm();

      if (s0 === peg$FAILED) {
        s0 = peg$parseFortuneTerm();

        if (s0 === peg$FAILED) {
          s0 = peg$parseMindTerm();

          if (s0 === peg$FAILED) {
            s0 = peg$parseSuppliesTerm();
          }
        }
      }
    }

    return s0;
  }

  function peg$parseBloodTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 5) === peg$c3) {
      s1 = peg$c3;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c4);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c5) {
        s1 = peg$c5;
        peg$currPos += 5;
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

  function peg$parseEchoTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c8) {
      s1 = peg$c8;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c9);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c10) {
        s1 = peg$c10;
        peg$currPos += 4;
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

  function peg$parseFortuneTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 7) === peg$c13) {
      s1 = peg$c13;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c14);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 7) === peg$c15) {
        s1 = peg$c15;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c16);
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

  function peg$parseMindTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 4) === peg$c17) {
      s1 = peg$c17;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c18);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c19) {
        s1 = peg$c19;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c20);
        }
      }
    }

    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c21();
    }

    s0 = s1;
    return s0;
  }

  function peg$parseSuppliesTerm() {
    var s0, s1;
    s0 = peg$currPos;

    if (input.substr(peg$currPos, 8) === peg$c22) {
      s1 = peg$c22;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c23);
      }
    }

    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 8) === peg$c24) {
        s1 = peg$c24;
        peg$currPos += 8;
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

  function peg$parse_() {
    var s0, s1;
    peg$silentFails++;
    s0 = [];

    if (peg$c28.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c29);
      }
    }

    while (s1 !== peg$FAILED) {
      s0.push(s1);

      if (peg$c28.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;

        if (peg$silentFails === 0) {
          peg$fail(peg$c29);
        }
      }
    }

    peg$silentFails--;

    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;

      if (peg$silentFails === 0) {
        peg$fail(peg$c27);
      }
    }

    return s0;
  }

  const Parser = options.parser ?? CONFIG.HEART.heart_fallout_roll_parser;
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