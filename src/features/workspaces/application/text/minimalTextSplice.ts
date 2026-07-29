export interface TextSplice {
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
}

const assertWellFormedUtf16 = (value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("Text contains ill-formed UTF-16");
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error("Text contains ill-formed UTF-16");
    }
  }
};

const splitsSurrogatePair = (value: string, index: number): boolean => {
  if (index <= 0 || index >= value.length) return false;
  const previous = value.charCodeAt(index - 1);
  const next = value.charCodeAt(index);
  return (
    previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
  );
};

/** Computes one smallest safe common-prefix/common-suffix UTF-16 splice. */
export const minimalTextSplice = (
  before: string,
  after: string
): TextSplice | null => {
  assertWellFormedUtf16(before);
  assertWellFormedUtf16(after);
  if (before === after) return null;

  let prefixLength = 0;
  const maximumPrefix = Math.min(before.length, after.length);
  while (
    prefixLength < maximumPrefix &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }
  if (
    splitsSurrogatePair(before, prefixLength) ||
    splitsSurrogatePair(after, prefixLength)
  ) {
    prefixLength -= 1;
  }

  let suffixLength = 0;
  const maximumSuffix = Math.min(
    before.length - prefixLength,
    after.length - prefixLength
  );
  while (
    suffixLength < maximumSuffix &&
    before[before.length - suffixLength - 1] ===
      after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }
  if (
    splitsSurrogatePair(before, before.length - suffixLength) ||
    splitsSurrogatePair(after, after.length - suffixLength)
  ) {
    suffixLength -= 1;
  }

  const insert = after.slice(prefixLength, after.length - suffixLength);
  assertWellFormedUtf16(insert);
  return {
    index: prefixLength,
    deleteCount: before.length - prefixLength - suffixLength,
    insert,
  };
};
