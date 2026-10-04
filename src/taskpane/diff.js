// 轻量行级 diff：裁剪公共前后缀 + LCS，用于版本对比。
// 只处理文本行，不追求 git 级别的性能与精度，够用且零依赖。

const MAX_CELLS = 4_000_000;

export function splitLines(text) {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  if (normalized === "") return [];
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function op(type, text, oldLine, newLine) {
  return { type, text, oldLine, newLine };
}

/**
 * 逐行比较两段文本。
 * @returns {{ops: Array<{type:"eq"|"add"|"del", text:string, oldLine:number|null, newLine:number|null}>, add:number, del:number}}
 */
export function diffLines(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops = [];

  for (let i = 0; i < start; i++) ops.push(op("eq", a[i], i + 1, i + 1));

  if (midA.length * midB.length > MAX_CELLS) {
    for (let i = 0; i < midA.length; i++) ops.push(op("del", midA[i], start + i + 1, null));
    for (let i = 0; i < midB.length; i++) ops.push(op("add", midB[i], null, start + i + 1));
  } else {
    const n = midA.length;
    const m = midB.length;
    const width = m + 1;
    const dp = new Int32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * width + j] =
          midA[i] === midB[j]
            ? dp[(i + 1) * width + j + 1] + 1
            : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push(op("eq", midA[i], start + i + 1, start + j + 1));
        i++;
        j++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        ops.push(op("del", midA[i], start + i + 1, null));
        i++;
      } else {
        ops.push(op("add", midB[j], null, start + j + 1));
        j++;
      }
    }
    while (i < n) { ops.push(op("del", midA[i], start + i + 1, null)); i++; }
    while (j < m) { ops.push(op("add", midB[j], null, start + j + 1)); j++; }
  }

  for (let k = 0; k < a.length - endA; k++) {
    ops.push(op("eq", a[endA + k], endA + k + 1, endB + k + 1));
  }

  let add = 0;
  let del = 0;
  for (const item of ops) {
    if (item.type === "add") add++;
    else if (item.type === "del") del++;
  }
  return { ops, add, del };
}

export function diffStats(oldText, newText) {
  const { add, del } = diffLines(oldText, newText);
  return { add, del };
}
