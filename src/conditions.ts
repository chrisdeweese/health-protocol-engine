import type { UserProfile } from "./schemas.js";

type Token =
  | ["i", string]
  | ["s", string]
  | ["n", number]
  | ["b", boolean]
  | ["0", null]
  | ["o", "==" | "!=" | ">=" | "<=" | ">" | "<" | "&&" | "||" | "!"]
  | ["p", "(" | ")"];

type OperatorValue = Extract<Token, ["o", unknown]>[1];
type ConditionValue = string | number | boolean | null | string[] | number[] | boolean[];

class ConditionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly profile: UserProfile
  ) {}

  parse(): boolean {
    const value = this.parseOr();
    const token = this.peek();
    if (token) {
      throw new Error(`Unexpected token "${String(token[1])}"`);
    }
    return this.truthy(value);
  }

  private parseOr(): ConditionValue {
    let left = this.parseAnd();
    while (this.matchOperator("||")) {
      const right = this.parseAnd();
      left = this.truthy(left) || this.truthy(right);
    }
    return left;
  }

  private parseAnd(): ConditionValue {
    let left = this.parseComparison();
    while (this.matchOperator("&&")) {
      const right = this.parseComparison();
      left = this.truthy(left) && this.truthy(right);
    }
    return left;
  }

  private parseComparison(): ConditionValue {
    const left = this.parseUnary();
    const token = this.peek();
    if (token?.[0] !== "o" || (token[1].length > 1 ? token[1][1] !== "=" : token[1] === "!")) {
      return left;
    }

    this.index += 1;
    const right = this.parseUnary();
    return this.compare(left, token[1], right);
  }

  private parseUnary(): ConditionValue {
    if (this.matchOperator("!")) {
      return !this.truthy(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ConditionValue {
    const token = this.consume();
    if (!token) {
      throw new Error("Unexpected end of condition");
    }

    if (token[0] === "p" && token[1] === "(") {
      const value = this.parseOr();
      const close = this.consume();
      if (close?.[0] !== "p" || close[1] !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      return value;
    }

    if (token[0] === "i") {
      return this.resolveIdentifier(token[1]);
    }

    if (token[0] !== "o" && token[0] !== "p") {
      return token[1];
    }

    throw new Error(`Unexpected token "${String(token[1])}"`);
  }

  private resolveIdentifier(identifier: string): ConditionValue {
    if (!identifier.startsWith("user.")) {
      throw new Error(`Only user.* identifiers are allowed, received "${identifier}"`);
    }

    const path = identifier.slice("user.".length).split(".");
    let current: unknown = this.profile;
    for (const key of path) {
      if (typeof current !== "object" || current === null || !(key in current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[key];
    }

    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "number" ||
      typeof current === "boolean" ||
      this.isPrimitiveArray(current)
    ) {
      return current;
    }

    throw new Error(`Profile field "${identifier}" is not comparable`);
  }

  private compare(left: ConditionValue, operator: string, right: ConditionValue): boolean {
    if (operator === "==" || operator === "!=") {
      const equal = JSON.stringify(left) === JSON.stringify(right);
      return operator === "==" ? equal : !equal;
    }

    if (typeof left !== "number" || typeof right !== "number") {
      return false;
    }

    if (operator === ">=") return left >= right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    if (operator === "<") return left < right;
    throw new Error(`Unsupported operator "${operator}"`);
  }

  private truthy(value: ConditionValue): boolean {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  }

  private matchOperator(value: OperatorValue): boolean {
    const token = this.peek();
    if (token?.[0] === "o" && token[1] === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private consume(): Token | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private isPrimitiveArray(value: unknown): value is string[] | number[] | boolean[] {
    return Array.isArray(value) && value.every((item) => "string number boolean".includes(typeof item));
  }
}

export function evaluateCondition(condition: string | undefined, profile: UserProfile): boolean {
  if (!condition || condition.trim() === "" || condition.trim() === "always") {
    return true;
  }

  const tokens = tokenize(condition);
  return new ConditionParser(tokens, profile).parse();
}

function tokenize(condition: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < condition.length) {
    const char = condition[index];
    if (!char) break;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const two = condition.slice(index, index + 2);
    if (two[1] === "=" || two === "&&" || two === "||") {
      tokens.push(["o", two as OperatorValue]);
      index += 2;
      continue;
    }

    if ("><!".includes(char)) {
      tokens.push(["o", char as OperatorValue]);
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push(["p", char]);
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let value = "";
      index += 1;
      while (index < condition.length && condition[index] !== quote) {
        const next = condition[index];
        if (next === "\\") {
          const escaped = condition[index + 1];
          if (!escaped) throw new Error("Invalid escape sequence in condition string");
          value += escaped;
          index += 2;
          continue;
        }
        value += next;
        index += 1;
      }
      if (condition[index] !== quote) {
        throw new Error("Unterminated string in condition");
      }
      tokens.push(["s", value]);
      index += 1;
      continue;
    }

    const numberMatch = condition.slice(index).match(/^-?\d+(\.\d+)?/);
    if (numberMatch?.[0]) {
      tokens.push(["n", Number(numberMatch[0])]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = condition.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (identifierMatch?.[0]) {
      const value = identifierMatch[0];
      if (value === "true" || value === "false") {
        tokens.push(["b", value === "true"]);
      } else if (value === "null") {
        tokens.push(["0", null]);
      } else {
        tokens.push(["i", value]);
      }
      index += value.length;
      continue;
    }

    throw new Error(`Unsupported token "${char}" in condition`);
  }

  return tokens;
}
