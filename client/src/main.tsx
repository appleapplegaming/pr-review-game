import { render } from 'preact';

function App() {
  return <h1>Ship It</h1>;
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root element');
}

render(<App />, root);
