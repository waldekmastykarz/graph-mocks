// from https://github.com/microsoftgraph/microsoft-graph-explorer-v4/blob/db86b903f36ef1b882996d46aee52cd49ed4444b/src/app/utils/query-url-sanitization.ts

// Matches folder/file path which is part of url  e.g. /root:/FolderA/FileB.txt:/
const ITEM_PATH_REGEX = /(?:\/)[\w]+:[\w\/.]+(:(?=\/)|$)/g;
const ALL_ALPHA_REGEX = /^[a-z]+$/i;
// Matches strings with deprecation identifier
const DEPRECATION_REGEX = /^[a-z]+_v2$/gi;
// Matches patterns like root: <value>
const SANITIZED_ITEM_PATH_REGEX = /^[a-z]+:<value>$/i;
// Matches entity and entity set name patterns like microsoft.graph.group or all letters
const ENTITY_NAME_REGEX = /^((microsoft.graph(.[a-z]+)+)|[a-z]+)$/i;
// Matches patterns like users('MeganB@M365x214355.onmicrosoft.com')
const FUNCTION_CALL_REGEX = /^[a-z]+\(.*\)$/i;
const POSITIVE_INTEGER_REGEX = /^[1-9]\d*$/;
// Matches media type formats
// Examples: https://www.iana.org/assignments/media-types/media-types.xhtml
const MEDIA_TYPE_REGEX = /^(([a-z]+\/)?\w[\w+-.]*)$/i;
// Matches the format key=value
const KEY_VALUE_REGEX = /^[a-z]+=[a-z]+$/i;
// Matches property name patterns e.g. displayName or from/emailAddress/address
// or microsoft.graph.itemAttachment or microsoft.graph.itemAttachment/item
const PROPERTY_NAME_REGEX = /^[a-z]+([\.\/](?=([a-z]+))\2)*$/i;
// Matches segments of $search query option e.g.
// "description:One" AND ("displayName:Video" OR "displayName:Drive") will match
// "description:One", AND, ("displayName:Video" OR "displayName:Drive")
const SEARCH_SEGMENT_REGEX = /\(.*\)|(['"][\w\s]+['"])|\S+/g;
// Matches patterns within quotes e.g "displayName: Gupta"
const QUOTED_TEXT_REGEX = /^["']([^"]*)['"]$/;
// Matches comma separating segments of $expand query option  e.g. children($select=id,name),customer
// will match comma between children($select=id,name) and customer
const EXPAND_SEGMENT_REGEX = /,(?![^()]*\))/g;
// Matches segments of $filter query option values e.g. isRead eq false will match isRead, eq, false
// eslint-disable-next-line max-len
const FILTER_SEGMENT_REGEX = /\S+\(.*\)|\(.*?\)|\S+/gi;

// OData filter operators
const QUERY_FUNCTIONS = [
  'startswith',
  'endswith',
  'contains',
  'substring',
  'indexof',
  'concat',
  'isof'
];
const LOGICAL_OPERATORS = ['and', 'or', 'not'];
const COMPARISON_OPERATORS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le'];
const ARITHMETIC_OPERATORS = ['add', 'sub', 'mul', 'div', 'divby', 'mod'];
const LAMBDA_OPERATORS = ['/any', '/all'];

function removeExtraSlashesFromUrl(url) {
  return url.replace(/([^:]\/)\/+/g, '$1');
}

function getGraphVersion(url) {
  const { pathname } = new URL(url);
  const parts = pathname.substring(1).split('/');
  return parts[0];
}

function removeLeadingSlash(url) {
  return (url.charAt(0) === '/') ? url.substring(1) : url;
}

function getRequestUrl(url, version) {
  const { pathname } = new URL(url);
  const versionToReplace = pathname.startsWith(`/${version}`)
    ? version
    : getGraphVersion(url);
  const requestContent = pathname.split(versionToReplace).pop();
  return removeLeadingSlash(decodeURIComponent(requestContent?.replace(/\/$/, '')));
}

function generateSearchParameters(url, search) {
  const { search: searchParameters } = new URL(url);
  if (searchParameters) {
    try {
      search = decodeURI(searchParameters);
    } catch (error) {
      if (error.message === 'URI malformed') {
        search = searchParameters;
      }
    }
  }
  return search.replace(/\s/g, '+');
}

function generateSampleUrl(
  url,
  queryVersion,
  requestUrl,
  search
) {
  const { origin } = new URL(url);
  return removeExtraSlashesFromUrl(`${origin}/${queryVersion}/${requestUrl + search}`);
}

function parseSampleUrl(url, version) {
  let requestUrl = '';
  let queryVersion = '';
  let sampleUrl = '';
  let search = '';

  if (url !== '') {
    try {
      url = removeExtraSlashesFromUrl(url);
      queryVersion = version ? version : getGraphVersion(url);
      requestUrl = getRequestUrl(url, queryVersion);
      search = generateSearchParameters(url, search);
      sampleUrl = generateSampleUrl(url, queryVersion, requestUrl, search);
    } catch (error) {
      if (error.message === 'Failed to construct \'URL\': Invalid URL') {
        return {
          queryVersion,
          requestUrl,
          sampleUrl,
          search
        };
      }
    }
  }
  return {
    queryVersion,
    requestUrl,
    sampleUrl,
    search
  };
}

function isAllAlpha(str) {
  return ALL_ALPHA_REGEX.test(str);
}

/**
 * @param segment part of the url string to test
 * deprecated resources may have `_v2` temporarily
 * @returns boolean
 */
function isDeprecation(segment) {
  return DEPRECATION_REGEX.test(segment);
}

/**
 * Matches patterns like users('MeganB@M365x214355.onmicrosoft.com').
 * Characters before bracket must be letters only
 * @param segment
 */
function isFunctionCall(segment) {
  return FUNCTION_CALL_REGEX.test(segment);
}

function isPlaceHolderSegment(segment) {
  return segment.startsWith('{') && segment.endsWith('}')
}

/**
 * Skipped segments:
 * - Entities, entity sets and navigation properties, expected to contain alphabetic letters only
 * - Deprecated entities in the form <entity>_v2
 * The remaining URL segments are assumed to be variables that need to be sanitized
 * @param segment
 */
function sanitizePathSegment(previousSegment, segment) {
  const segmentsToIgnore = ['$value', '$count', '$ref', '$batch'];

  if (
    isAllAlpha(segment) ||
    isDeprecation(segment) ||
    SANITIZED_ITEM_PATH_REGEX.test(segment) ||
    segmentsToIgnore.includes(segment.toLowerCase()) ||
    ENTITY_NAME_REGEX.test(segment)
  ) {
    return segment;
  }

  // Check if segment is in this form: users('<some-id>|<UPN>') and transform to users(<value>)
  if (isFunctionCall(segment)) {
    const openingBracketIndex = segment.indexOf('(');
    const textWithinBrackets = segment.substr(
      openingBracketIndex + 1,
      segment.length - 2
    );
    const sanitizedText = textWithinBrackets
      .split(',')
      .map((text) => {
        if (text.includes('=')) {
          let key = text.split('=')[0];
          key = !isAllAlpha(key) ? '<key>' : key;
          return `${key}=<value>`;
        }
        return '<value>';
      })
      .join(',');
    return `${segment.substring(0, openingBracketIndex)}(${sanitizedText})`;
  }

  if (isPlaceHolderSegment(segment)) {
    return segment;
  }

  if (!isAllAlpha(previousSegment) && !isDeprecation(previousSegment)) {
    previousSegment = 'unknown';
  }

  return `{${previousSegment}-id}`;
}

function isPositiveInteger(str) {
  return POSITIVE_INTEGER_REGEX.test(str);
}

function isBooleanString(str) {
  return str === 'true' || str === 'false';
}

/**
 * @param queryOptionValue - The value of the $select query option is a
 * comma-separated list of properties, qualified action names, qualified function names,
 * the star operator (*), or the star operator prefixed with the namespace or alias of the schema.
 * Examples:
 * - GET /products?$select=rating,releaseDate
 * - GET /products?$select=*
 * - GET /products?$select=demoService.*
 */
function sanitizeSelectQueryOptionValue(queryOptionValue) {
  const selectedProperties = queryOptionValue.split(',');
  selectedProperties.forEach((property, index) => {
    property = property.trim();
    if (!isAllAlpha(property) && property !== '*' && !property.endsWith('.*')) {
      // MOD: don't replace with <invalid-property>
      // selectedProperties[index] = '<invalid-property>';
    }
  });
  return selectedProperties.join(',');
}

function isMediaType(str) {
  return MEDIA_TYPE_REGEX.test(str);
}

function isKeyValuePair(str) {
  return KEY_VALUE_REGEX.test(str);
}

/**
 * @param queryOptionValue - The value of the $format query option is a
 * valid internet media type, optionally including parameters. Format-specific abbreviations may be used.
 * Examples:
 * - GET /orders?$format=application/json;metadata=full
 * - GET /orders?$format=json
 */
function sanitizeFormatQueryOptionValue(queryOptionValue) {
  // Separate media type from parameters.
  const formatSegments = queryOptionValue.split(';');
  formatSegments.forEach((segment, index) => {
    // first segment is supposed to be media type
    if (index === 0) {
      const mediaType = segment.trim();
      formatSegments[index] = !isMediaType(mediaType)
        ? '<invalid-media-type>'
        : mediaType;
    }
    // This should be a parameter, key-value pair e.g. odata=minimalmetadata
    else if (!isKeyValuePair(segment)) {
      formatSegments[index] = '<invalid-parameter>';
    }
  });
  return formatSegments.join(';');
}

function isPropertyName(str) {
  return PROPERTY_NAME_REGEX.test(str);
}

/**
 * @param queryOptionValue - The value of the $orderby query option is a
 * a comma-separated list of expressions which includes a property name, a property path
 * terminating on a primitive property and/or suffix asc/desc denoting direction of sorting
 * Examples:
 * - GET /users?orderby=displayName
 * - GET /products?$orderby=releasedate asc,rating desc
 * - GET /categories?$orderby=products/$count
 */
function sanitizeOrderByQueryOptionValue(queryOptionValue) {
  const sortingExpressions = queryOptionValue.split(',');

  sortingExpressions.forEach((expr, index) => {
    const expressionParts = expr.split(' ').filter((x) => x !== ''); // i.e. property name and sort order
    let propertyName = expressionParts[0]?.trim();
    if (
      !isPropertyName(propertyName) &&
      !propertyName.endsWith('/$count') &&
      !isPropertyName(propertyName.slice(-7))
    ) {
      propertyName = '<invalid-property>';
    }
    let sanitizedExpression = propertyName;

    // Check if sort direction has been included
    if (expressionParts.length > 1) {
      let sortDirection = expressionParts[1].trim().toLowerCase();
      if (sortDirection) {
        if (sortDirection !== 'asc' && sortDirection !== 'desc') {
          sortDirection = '<unexpected-value>';
        }
        sanitizedExpression += ` ${sortDirection}`;
      }
    }
    sortingExpressions[index] = sanitizedExpression;
  });
  return sortingExpressions.join(',');
}

/**
 * @param queryOptionValue - The value of the $search query option contains the search term and
 * can also include the target property of your search
 * Examples:
 * GET /me/messages?$search="pizza"
 * GET /me/messages?$search="body:excitement"
 * GET /groups?$search="description:One" AND ("displayName:Video" OR "displayName:Drive")
 */
function sanitizeSearchQueryOptionValue(queryOptionValue) {
  let sanitizedQueryString = '';
  const searchSegments = queryOptionValue.match(SEARCH_SEGMENT_REGEX);
  // This means $search value is empty
  if (searchSegments === null) {
    return sanitizedQueryString;
  }

  for (const searchSegment of searchSegments) {
    const segment = searchSegment.trim();

    // No processing needed for logicalOperators operators; append operator to query string.
    if (LOGICAL_OPERATORS.includes(segment.toLowerCase())) {
      sanitizedQueryString += ` ${segment}`;
      continue;
    }

    // Sanitize segment in the form of "pizza" and "body:excitement"
    if (QUOTED_TEXT_REGEX.test(segment)) {
      if (!segment.includes(':')) {
        sanitizedQueryString += ' <value>';
      } else {
        // Extract property name
        let propertyName = segment.substring(1, segment.indexOf(':')).trim();
        if (!isPropertyName(propertyName)) {
          propertyName = '<property>';
        }
        sanitizedQueryString += ` "${propertyName}:<value>"`;
      }
      continue;
    }

    // Sanitize segments within brackets
    if (segment.startsWith('(')) {
      const textWithinBrackets = segment.substr(1, segment.length - 2);
      const sanitizedText = sanitizeSearchQueryOptionValue(textWithinBrackets);
      sanitizedQueryString += ` (${sanitizedText})`;
      continue;
    }

    // Anything that get's here is unknown
    sanitizedQueryString += isAllAlpha(segment) ? ' <value>' : ' <unknown>';
  }
  return sanitizedQueryString.trim();
}

/**
 * @param queryParameterValue
 * Examples:
 * - GET /me/drive/root?$expand=children($select=id,name)
 * - GET /employees?$expand=directreports($filter=firstName eq 'mary'))
 * - GET /orders?$expand=Items($expand=product),customer
 */
function sanitizeExpandQueryOptionValue(queryParameterValue) {
  let sanitizedQueryString = '';

  // Split comma separated list of navigation properties
  const expandSegments = queryParameterValue.split(EXPAND_SEGMENT_REGEX);

  for (let index = 0; index < expandSegments.length; index++) {
    const segment = expandSegments[index].trim();

    if (index > 0) {
      sanitizedQueryString += ',';
    }

    if (isPropertyName(segment)) {
      sanitizedQueryString += ` ${segment}`;
      continue;
    }

    const openingBracketIndex = segment.indexOf('(');
    if (openingBracketIndex > 0) {
      let propertyName = segment.substring(0, openingBracketIndex).trim();
      if (!isPropertyName(propertyName)) {
        propertyName = '<property>';
      }
      // Sanitize text within brackets which should be key-value pairs of OData query options
      const textWithinBrackets = segment
        .substring(openingBracketIndex + 1, segment.length - 1)
        .trim();
      const sanitizedText = textWithinBrackets
        .split(';')
        .map(sanitizeQueryParameter)
        .join(';');
      sanitizedQueryString += `${propertyName}(${sanitizedText})`;
      continue;
    }

    // Anything that get's here is unknown
    sanitizedQueryString += ' <unknown>';
  }

  return sanitizedQueryString.trim();
}

/**
 * @param queryParameterValue
 *
 * Split $filter value into chuncks in the below categories then process independeently
 * Functions e.g. startWith(<property>, '<value>'),
 * Operators e.g. and, not, eq,
 * Properties e.g Surname, UserPrincipalName,
 * Variables, likely to be enclosed within single quotes
 *
 * Examples:
 * GET /users?$filter=startsWith(displayName,'J')
 * GET /me/messages?$filter=from/emailAddress/address eq 'no-reply@microsoft.com'
 */
function sanitizeFilterQueryOptionValue(queryParameterValue) {
  let sanitizedQueryString = '';

  const filterSegments = queryParameterValue.match(FILTER_SEGMENT_REGEX);
  // This means $filter value is empty
  if (filterSegments === null) {
    return sanitizedQueryString;
  }

  const numberOfFilterSegments = filterSegments.length;
  for (let index = 0; index < numberOfFilterSegments; index++) {
    const segment = filterSegments[index];

    // No processing needed for operators; append operator to query string.
    const lowerCaseOperator = segment.toLowerCase();
    if (
      LOGICAL_OPERATORS.includes(lowerCaseOperator) ||
      COMPARISON_OPERATORS.includes(lowerCaseOperator) ||
      ARITHMETIC_OPERATORS.includes(lowerCaseOperator)
    ) {
      sanitizedQueryString += ` ${lowerCaseOperator} `;
      continue;
    }

    // Check for collection operators
    const openingBracketIndex = segment.indexOf('(');
    const closingBracketIndex = segment.indexOf(')');
    let propertyName = segment.substring(0, openingBracketIndex);
    const lambdaOperator = propertyName.slice(-4);
    if (LAMBDA_OPERATORS.includes(lambdaOperator)) {
      propertyName = propertyName.substring(0, propertyName.length - 4);
      if (!isPropertyName(propertyName)) {
        propertyName = '<property>';
      }
      let textWithinBrackets = segment
        .substring(openingBracketIndex + 1, segment.length - 1)
        .trim();
      if (textWithinBrackets) {
        let key = '';
        if (textWithinBrackets.includes(':')) {
          key = textWithinBrackets
            .substring(0, textWithinBrackets.indexOf(':'))
            .trim();
          textWithinBrackets = textWithinBrackets.substring(
            textWithinBrackets.indexOf(':') + 1
          );
        }
        textWithinBrackets = `${key}: ${sanitizeFilterQueryOptionValue(
          textWithinBrackets
        )}`;
      }
      sanitizedQueryString += `${propertyName}${lambdaOperator}(${textWithinBrackets})`;
      continue;
    }

    // Check if segment is a query function then transform query functions to look like this,
    // 'startswith(userPrincipalName,<value>)' as an example
    let queryFunctionPrefix = '';
    QUERY_FUNCTIONS.forEach((funcName) => {
      if (segment.toLowerCase().startsWith(funcName)) {
        queryFunctionPrefix = funcName;
      }
    });
    if (queryFunctionPrefix) {
      const commaIndex = segment.indexOf(',');
      if (openingBracketIndex > 0) {
        // End of property name is when we encounter a comma, bracket or end of segment, in that order
        const endIndex =
          commaIndex > 0
            ? commaIndex
            : closingBracketIndex > 0
              ? closingBracketIndex
              : segment.length;
        propertyName = segment
          .substring(openingBracketIndex + 1, endIndex)
          .trim();

        if (!isPropertyName(propertyName)) {
          propertyName = '<property>';
        }
        sanitizedQueryString += `${queryFunctionPrefix}(${propertyName}${commaIndex > 0 ? ',<value>' : ''
        })`;
      } else {
        sanitizedQueryString += `${queryFunctionPrefix}(<unknown>)`;
        break;
      }
      continue;
    }

    // Sanitize segments within brackets
    if (segment.startsWith('(')) {
      const textWithinBrackets = segment.substr(1, segment.length - 2);
      const sanitizedText = sanitizeFilterQueryOptionValue(textWithinBrackets);
      sanitizedQueryString += `(${sanitizedText})`;
      continue;
    }

    // Property names, (standing on their own) should be succeeded by comparison or arithmetic operators
    if (PROPERTY_NAME_REGEX.test(segment)) {
      // check if succeeded by comparison operator
      if (index < numberOfFilterSegments - 2) {
        const expectedOperator = filterSegments[index + 1].toLowerCase();
        if (
          COMPARISON_OPERATORS.includes(expectedOperator) ||
          ARITHMETIC_OPERATORS.includes(expectedOperator)
        ) {
          sanitizedQueryString += `${segment} ${filterSegments[index + 1]
          } <value>`;
          index += 2;
          continue;
        }
      }
    } else if (index > 0) {
      // We are checking if this is a value following a comparison or arithmetic operator
      const expectedOperator = filterSegments[index - 1];
      if (
        COMPARISON_OPERATORS.includes(expectedOperator) ||
        ARITHMETIC_OPERATORS.includes(expectedOperator)
      ) {
        sanitizedQueryString += '<value>';
        continue;
      }
    }

    // Anything that get's here is unknown
    sanitizedQueryString += ' <unknown>';
  }
  return sanitizedQueryString.trim();
}

/**
 * Redact variable segments of query parameters
 * @param queryParameter e.g. $top=5, $search="pizza", $filter=startswith(displayName, 'J')
 */
function sanitizeQueryParameter(queryParameter) {
  // return if not key-value pair
  if (!queryParameter.includes('=')) {
    return queryParameter;
  }

  let key = queryParameter.split('=')[0].toLowerCase().trim();
  let value = queryParameter
    .substring(queryParameter.indexOf('=') + 1)
    .trim();

  switch (key) {
    case '$top':
    case '$skip': {
      if (!isPositiveInteger(value)) {
        value = '<invalid-value>';
      }
      break;
    }

    case '$skiptoken':
    case '$deltatoken': {
      value = '<value>';
      break;
    }

    case '$count': {
      if (!isBooleanString(value)) {
        value = '<invalid-value>';
      }
      break;
    }

    case '$select': {
      value = sanitizeSelectQueryOptionValue(value);
      break;
    }

    case '$format': {
      value = sanitizeFormatQueryOptionValue(value);
      break;
    }

    case '$orderby': {
      value = sanitizeOrderByQueryOptionValue(value);
      break;
    }

    case '$search': {
      value = sanitizeSearchQueryOptionValue(value);
      break;
    }

    case '$expand': {
      value = sanitizeExpandQueryOptionValue(value);
      break;
    }

    case '$filter': {
      value = sanitizeFilterQueryOptionValue(value);
      break;
    }

    default: {
      // Parameters like $id, $levels will be left as they are
      if (
        !isAllAlpha(key) &&
        !key.startsWith('$') &&
        !isAllAlpha(key.substring(1))
      ) {
        key = '<invalid-key>';
      }
      value = '<value>';
    }
  }
  return `${key}=${value}`;
}

/**
 * Remove variable data from each query parameter
 * @param queryString
 */
function sanitizeQueryParameters(queryString) {
  // remove leading ? from query string and decode
  queryString = decodeURIComponent(
    queryString.substring(1).replace(/\+/g, ' ')
  );
  return queryString.split('&').map(sanitizeQueryParameter).join('&');
}

function sanitizedQueryUrl(url) {
  url = decodeURIComponent(url);
  const { origin } = new URL(url);

  const { search, queryVersion, requestUrl } = parseSampleUrl(url);
  const queryString = search
    ? `?${sanitizeQueryParameters(search)}`
    : '';

  // Sanitize item path specified in query url
  let resourceUrl = requestUrl;
  if (resourceUrl) {
    resourceUrl = requestUrl.replace(
      ITEM_PATH_REGEX,
      match => {
        return `${match.substring(0, match.indexOf(':'))}:<value>`;
      }
    );
    // Split requestUrl into segments that can be sanitized individually
    const urlSegments = resourceUrl.split('/');
    urlSegments.forEach((segment, index) => {
      const sanitizedSegment = sanitizePathSegment(
        urlSegments[index - 1],
        segment
      );
      resourceUrl = resourceUrl.replace(segment, sanitizedSegment);
    });
  }
  return `${origin}/${queryVersion}/${resourceUrl}${queryString}`;
}

exports.sanitizeUrl = function (url) {
  try {
    return sanitizedQueryUrl(url);
  } catch (e) {
    return '';
  }
}