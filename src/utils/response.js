const STATUS_MESSAGES = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required",
};

function handleResponse(code, msg, data, res) {
  const statusCode = code || 500;
  const httpStatusMsg = STATUS_MESSAGES[statusCode] || "Unknown Error";
  const message = msg || httpStatusMsg;
  const success = statusCode >= 200 && statusCode < 400;

  return res.status(statusCode).json({
    http_status_code: statusCode,
    http_status_msg: httpStatusMsg,
    success,
    data: data ?? null,
    message,
    timestamp: new Date().toISOString(),
  });
}

function ok(res, data, status = 200, message) {
  return handleResponse(status, message || STATUS_MESSAGES[status] || "OK", data ?? null, res);
}

function fail(res, message, status = 400, data) {
  return handleResponse(status, message || STATUS_MESSAGES[status] || "Unknown Error", data ?? null, res);
}

export { handleResponse, ok, fail, STATUS_MESSAGES };
export default handleResponse;
