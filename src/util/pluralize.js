export default function pluralize(num, noun) {
  return num === 1 ? `${num} ${noun}` : `${num} ${noun}s`;
}
