/**
 * Copied from moment-precise-range, which is MIT-licensed, with minor cleanups
 * to appease ESLint and remove an unused option.
 *
 * https://github.com/codebox/moment-precise-range
 *
 * The original plugin worked by modifying the global moment installation, which
 * caused problems if multiple moment instances were installed, so this should
 * avoid that.
 */

import moment from 'moment';

const STRINGS = {
  nodiff: '',
  year: 'year',
  years: 'years',
  month: 'month',
  months: 'months',
  day: 'day',
  days: 'days',
  hour: 'hour',
  hours: 'hours',
  minute: 'minute',
  minutes: 'minutes',
  second: 'second',
  seconds: 'seconds',
  delimiter: ' ',
};

function pluralize(num, word) {
  return num + ' ' + STRINGS[word + (num === 1 ? '' : 's')];
}

function buildStringFromValues(yDiff, mDiff, dDiff, hourDiff, minDiff, secDiff){
  let result = [];

  if (yDiff) {
    result.push(pluralize(yDiff, 'year'));
  }
  if (mDiff) {
    result.push(pluralize(mDiff, 'month'));
  }
  if (dDiff) {
    result.push(pluralize(dDiff, 'day'));
  }
  if (hourDiff) {
    result.push(pluralize(hourDiff, 'hour'));
  }
  if (minDiff) {
    result.push(pluralize(minDiff, 'minute'));
  }
  if (secDiff) {
    result.push(pluralize(secDiff, 'second'));
  }

  return result.join(STRINGS.delimiter);
}

export default function momentPreciseDiff(m1, m2) {
  m1.add(m2.utcOffset() - m1.utcOffset(), 'minutes'); // shift timezone of m1 to m2

  if (m1.isSame(m2)) {
    return STRINGS.nodiff;
  }

  if (m1.isAfter(m2)) {
    let tmp = m1;
    m1 = m2;
    m2 = tmp;
  }

  let yDiff = m2.year() - m1.year();
  let mDiff = m2.month() - m1.month();
  let dDiff = m2.date() - m1.date();
  let hourDiff = m2.hour() - m1.hour();
  let minDiff = m2.minute() - m1.minute();
  let secDiff = m2.second() - m1.second();

  if (secDiff < 0) {
    secDiff = 60 + secDiff;
    minDiff--;
  }
  if (minDiff < 0) {
    minDiff = 60 + minDiff;
    hourDiff--;
  }
  if (hourDiff < 0) {
    hourDiff = 24 + hourDiff;
    dDiff--;
  }
  if (dDiff < 0) {
    let daysInLastFullMonth = moment(m2.year() + '-' + (m2.month() + 1), 'YYYY-MM').subtract(1, 'M').daysInMonth();
    if (daysInLastFullMonth < m1.date()) { // 31/01 -> 2/03
      dDiff = daysInLastFullMonth + dDiff + (m1.date() - daysInLastFullMonth);
    } else {
      dDiff = daysInLastFullMonth + dDiff;
    }
    mDiff--;
  }
  if (mDiff < 0) {
    mDiff = 12 + mDiff;
    yDiff--;
  }

  return buildStringFromValues(yDiff, mDiff, dDiff, hourDiff, minDiff, secDiff);
}
