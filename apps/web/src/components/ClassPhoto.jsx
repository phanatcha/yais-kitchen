import { useCurrentClassPhoto } from "../lib/catalog.js";
import PhotoSlot from "./PhotoSlot.jsx";

/** A booked class's dish photo, as catalog has it now. */
export default function ClassPhoto({ classInfo, ...props }) {
  const photo = useCurrentClassPhoto(classInfo);
  // A new key lets the slot try again when the current photo arrives.
  return (
    <PhotoSlot
      key={photo?.assetId}
      label={classInfo.dish}
      photo={photo}
      {...props}
    />
  );
}
