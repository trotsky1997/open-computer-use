export function accessibilityStateDiff(previous, text, label) {
  if (previous === undefined) return text;
  const before = previous.split('\n'), after = text.split('\n');
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  if (start === before.length && start === after.length) return 'Accessibility state unchanged.';
  const removed = before.slice(start, before.length - end), added = after.slice(start, after.length - end);
  const diff = `Accessibility state diff for ${label} (replace ${removed.length} line(s) at line ${start + 1} with ${added.length} line(s)):\n${removed.map(line => `- ${line}`).join('\n')}\n${added.map(line => `+ ${line}`).join('\n')}`;
  return diff.length < text.length ? diff : text;
}

const states = new Set(['busy','checked','disabled','editable','expanded','focused','hasPopup','invalid','level','modal','multiline','multiselectable','orientation','pressed','readonly','required','selected','valuemin','valuemax','valuetext']);
export function browserAccessibilityState(nodes) {
  const byId = new Map(nodes.map(node => [node.nodeId, node])), visited = new Set(), lines = [];
  const roots = nodes.filter(node => !byId.has(node.parentId));
  const stack = roots.toReversed().map(node => ({node, depth:0}));
  function append() {
    while (stack.length) {
      const {node, depth} = stack.pop();
      if (!node || visited.has(node.nodeId)) continue;
      visited.add(node.nodeId);
      // Inline text boxes duplicate StaticText and receive new IDs on every CDP attachment.
      const visible=!node.ignored && node.role?.value!=='InlineTextBox';
      if (visible) {
        const attributes = [];
        if (node.frameURL) attributes.push(`frame=${JSON.stringify(node.frameURL)}`);
        if (node.value) attributes.push(`value=${JSON.stringify(node.value.value)}`);
        if (node.description?.value) attributes.push(`description=${JSON.stringify(node.description.value)}`);
        for (const {name, value} of node.properties ?? []) {
          if (!states.has(name) || !['string','number','boolean'].includes(typeof value?.value)) continue;
          const rendered = value.type === 'tristate' && ['true','false','mixed'].includes(value.value) ? value.value : JSON.stringify(value.value);
          attributes.push(`${name}=${rendered}`);
        }
        lines.push(`${'  '.repeat(depth)}[${node.nodeId}] ${node.role?.value ?? ''} ${JSON.stringify(node.name?.value ?? '')}${attributes.length ? ' '+attributes.join(' ') : ''}`);
      }
      for (const id of (node.childIds ?? []).toReversed()) stack.push({node:byId.get(id), depth:depth+(visible ? 1 : 0)});
    }
  }
  append();
  // Preserve observed nodes if a partial native tree omits their ancestry edges.
  for (const node of nodes) if (!visited.has(node.nodeId)) {stack.push({node,depth:0});append();}
  return lines.join('\n');
}
