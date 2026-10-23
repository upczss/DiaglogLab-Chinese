// A network chunk can end within a UTF-8 character or within a JSON event.
export function createLineDecoder() {
  const decoder = new TextDecoder();
  let pending = '';
  return {
    decode(value, final = false) {
      pending += decoder.decode(value, { stream: !final });
      const end = final ? pending.length : pending.lastIndexOf('\n') + 1;
      const complete = pending.slice(0, end);
      pending = pending.slice(end);
      return complete;
    },
  };
}
