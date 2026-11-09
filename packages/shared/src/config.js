// Reads environment variables once, at start-up. If one is missing or wrong,
// the service stops before it takes any traffic, and the message lists every
// problem at once. Values never appear in the message, because some are
// secrets.

export class ConfigError extends Error {
  constructor(problems) {
    const list = problems.map((problem) => `  - ${problem}`).join("\n");
    super(`Environment variables are missing or wrong:\n${list}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const parsers = {
  string: (raw) => raw,
  integer(raw) {
    if (!/^-?\d+$/.test(raw)) throw new Error("must be a whole number");
    return Number(raw);
  },
  port(raw) {
    const port = parsers.integer(raw);
    if (port < 0 || port > 65535) throw new Error("must be 0 to 65535");
    return port;
  },
  url(raw) {
    if (!URL.canParse(raw)) throw new Error("must be a full URL");
    return raw;
  },
  // Keys in .env files are usually written on one line with \n in them.
  pem(raw) {
    const pem = raw.replaceAll("\\n", "\n");
    if (!pem.includes("-----BEGIN ")) throw new Error("must be a PEM key");
    return pem;
  },
};

/**
 * @param {Record<string, { type?: keyof typeof parsers, default?: unknown, optional?: boolean }>} vars
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(vars, env = process.env) {
  const config = {};
  const problems = [];

  for (const [name, rule] of Object.entries(vars)) {
    const { type = "string", default: fallback, optional = false } = rule;
    const parse = parsers[type];
    if (!parse) throw new TypeError(`Unknown type "${type}" for ${name}`);

    const raw = env[name]?.trim();
    if (!raw) {
      if (fallback !== undefined) config[name] = fallback;
      else if (optional) config[name] = undefined;
      else problems.push(`${name} is missing`);
      continue;
    }

    try {
      config[name] = parse(raw);
    } catch (error) {
      problems.push(`${name} ${error.message}`);
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return Object.freeze(config);
}
