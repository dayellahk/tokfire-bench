export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {super(message);this.status=status;}
}
export function authorizeWrite(request: Request, owner: string | null) {
  const origin=request.headers.get('origin');
  if(origin && origin !== new URL(request.url).origin) throw new ApiError(403,'Cross-origin write rejected');
  if(request.headers.get('sec-fetch-site')==='cross-site') throw new ApiError(403,'Cross-site write rejected');
  if(!owner)throw new ApiError(401,'Sign in to manage your results');
  return owner;
}
