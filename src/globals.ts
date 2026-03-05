import moment from 'moment';
import $ from 'jquery';

// Resolve moment function (Vite/ESM handle)
const momentFunc = (moment as any).default || moment;

// Expose to window for plugins like daterangepicker
(window as any).moment = momentFunc;
(window as any).jQuery = (window as any).$ = $;

export { momentFunc as moment, $ };
