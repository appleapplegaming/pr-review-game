import { render } from 'preact';
import { App } from './app';
import { net } from './net/live';
import './styles/global.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root element');
}

net.start();
render(<App />, root);
