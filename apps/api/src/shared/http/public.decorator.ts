import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'cdr:public-route';

/** Marks a route as reachable without authentication (health probes and login only). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);
