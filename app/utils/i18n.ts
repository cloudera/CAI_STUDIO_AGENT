import localStrings from '../_i18n/en-US.json';
const language: { [key: string]: string } = localStrings;

const _i18n = {
  /**
   * Retrieves a localized string from the string table and formats it if necessary.
   * @param {string} key The key associated with the string in the string table.
   * @return {string}
   * @see module:formatString
   * @example
   * assume label.properties contains:
   * message.key1=Hello World
   * message.key2=Hello {0}, {1}?
   *
   * var msg1 = i18n.t('message.key1');
   * // msg1 now returns Hello World
   *
   * var msg2 = i18n.t('message.key2', ['Joe', 'How are you?');
   * // msg2 now returns Hello Joe, How are you?
   */
  t(key: string, ...args: any) {
    // If key isn't a string, we might be passing in react nodes, or other objects. Just return the
    // input as is.
    if (typeof key !== 'string') {
      return key;
    }

    if (args.length > 0) {
      // If there are more than 2 arguments or argument one is not an object, treat it as a vararg.
      if (args.length > 1 || typeof args[0] !== 'object') {
        // Replace the key with its associated string.
        const message = language[key] || key;
        args = [message, args];
      }

      // @ts-expect-error typing trouble with the rest parm
      return formatString(...args);
    }
    return language[key] || key;
  },

  hasKey: (key: any): boolean => typeof key === 'string' && !!language[key],

  extend(extendedLocale: { [key: string]: string }) {
    Object.assign(language, extendedLocale);
  },
};

const i18n = _i18n;

export default i18n;
export const t = i18n.t;

// Find {string} or {numeric} placeholders
const expression = /\{(?:(\d*)|([^\}]*))\}/g;

/**
 * Replaces all instances of {property} or {index} with
 * with the equivalent properties of the params object or value from the params array.
 * @param {string} str The template string to formatString.
 * @param {object|array} params The params to formatString the string with.
 * @return {string}
 */

const formatString = function (str: string, params: any) {
  let result = '',
    lastMatch = 0,
    currentMatch,
    currentValue,
    loop = true;

  while (loop) {
    currentMatch = expression.exec(str);
    if (!currentMatch) {
      if (lastMatch !== str.length) {
        result += str.substring(lastMatch);
      }

      loop = false;
      return result;
    }

    result += str.substring(lastMatch, currentMatch.index);

    if (currentMatch[1]) {
      currentValue = params[parseInt(currentMatch[1], 10)];
    } else {
      currentValue = params[currentMatch[2]];
    }

    if (currentValue !== undefined) {
      result += currentValue;
    }

    lastMatch = currentMatch.index + currentMatch[0].length;
  }

  return result;
};
