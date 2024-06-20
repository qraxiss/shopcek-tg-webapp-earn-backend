import { castArray, map, every, pipe } from "lodash/fp";
import { errors } from "@strapi/utils";
const { ForbiddenError, UnauthorizedError } = errors;
import { Context } from "koa"; // Assuming Koa is used for the context
import {
  walletInfo,
  publicPermissions as getPublicPermissions,
} from "../../../../helpers/auth-service";

const getService = (name) => {
  return strapi.plugin("users-permissions").service(name);
};

// Define types for user, token, and settings
interface User {
  id: string;
  confirmed: boolean;
  blocked: boolean;
  role: {
    id: string;
  };
}

interface Token {
  id?: string;
}

interface Auth {
  authenticated: boolean;
  credentials: User | null;
  ability: any;
  error?: string;
}

interface Config {
  scope?: string | string[];
}

const getAdvancedSettings = async (): Promise<any> => {
  return await strapi
    .store({ type: "plugin", name: "users-permissions" })
    .get({ key: "advanced" });
};

const authenticate = async (ctx: Context): Promise<Auth> => {
  try {
    const { address } = ctx.session;
    if (address) {
      // Invalid token
      if (!address) {
        return { authenticated: false, credentials: null, ability: null };
      }

      const { user, permissions } = await walletInfo(address);

      // No user associated with the token
      if (!user) {
        return {
          authenticated: false,
          credentials: null,
          ability: null,
          error: "Invalid credentials",
        };
      }

      // Generate an ability (content API engine) based on the given permissions
      const ability =
        await strapi.contentAPI.permissions.engine.generateAbility(permissions);

      ctx.state.user = user;

      return {
        authenticated: true,
        credentials: user,
        ability,
      };
    }

    const publicPermissions = await getPublicPermissions();

    if (publicPermissions.length === 0) {
      return { authenticated: false, credentials: null, ability: null };
    }

    const ability = await strapi.contentAPI.permissions.engine.generateAbility(
      publicPermissions
    );

    return {
      authenticated: true,
      credentials: null,
      ability,
    };
  } catch (err) {
    return { authenticated: false, credentials: null, ability: null };
  }
};

const verify = async (auth: Auth, config: Config): Promise<void> => {
  const { credentials: user, ability } = auth;
  if (!config.scope) {
    if (!user) {
      // A non authenticated user cannot access routes that do not have a scope
      throw new UnauthorizedError();
    } else {
      // An authenticated user can access non scoped routes
      return;
    }
  }

  // If no ability has been generated, then consider auth is missing
  if (!ability) {
    throw new UnauthorizedError();
  }

  const isAllowed = pipe(
    // Make sure we're dealing with an array
    castArray,
    // Transform the scope array into an action array
    every((scope: string) => ability.can(scope))
  )(config.scope);

  if (!isAllowed) {
    throw new ForbiddenError();
  }
};

export default {
  name: "users-permissions",
  authenticate,
  verify,
};
