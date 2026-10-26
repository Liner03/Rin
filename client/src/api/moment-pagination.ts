import type { MomentListResponse } from "@rin/api";

export function shouldResetFollowingMoments(previous: MomentListResponse | undefined, next: MomentListResponse): boolean {
  return !previous || !next.hasNext || (
    previous.data.length !== next.data.length || previous.data.some((moment, index) => moment.id !== next.data[index]?.id)
  );
}
