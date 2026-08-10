import { Eye, Heart, MessageCircle } from "lucide-react";
import { formatCount } from "../lib/format";

interface Props {
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  onCommentsClick: () => void;
}

/**
 * Like, view and comment counters down the right edge of a reel.
 *
 * Likes/views are read-only on web: liking requires an authenticated session
 * that the public SEO-rendered feed does not have, so showing a control that
 * cannot work would be worse than showing none. Comments are the exception —
 * the panel itself (see ReelComments.tsx) already gates posting on login and
 * shows a disabled "Login to comment" state, so the button here is always
 * safe to open. The mobile feed has the fully interactive version of all three.
 */
export default function ReelStats({ likesCount, viewsCount, commentsCount, onCommentsClick }: Props) {
  return (
    <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4 text-white">
      <span className="flex flex-col items-center text-xs font-semibold">
        <Heart className="mb-1 h-6 w-6" aria-hidden />
        {formatCount(likesCount)}
        <span className="sr-only">likes</span>
      </span>
      <button
        onClick={onCommentsClick}
        className="flex flex-col items-center text-xs font-semibold transition-colors hover:text-emerald-400"
      >
        <MessageCircle className="mb-1 h-6 w-6" aria-hidden />
        {formatCount(commentsCount)}
        <span className="sr-only">comments</span>
      </button>
      <span className="flex flex-col items-center text-xs font-semibold">
        <Eye className="mb-1 h-6 w-6" aria-hidden />
        {formatCount(viewsCount)}
        <span className="sr-only">views</span>
      </span>
    </div>
  );
}
