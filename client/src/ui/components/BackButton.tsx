import { MdArrowBack } from "react-icons/md";
import { useGoBack } from "../../lib/navigation";
import { IconButton } from "./Buttons";

/** The round back arrow at the top left of a page: returns to exactly where the person was (see useGoBack). */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const goBack = useGoBack(fallback);
  return <IconButton icon={<MdArrowBack />} label="Back" clickSound="back" className={className} onClick={goBack} />;
}
