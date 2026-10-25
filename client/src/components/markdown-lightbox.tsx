import Lightbox, { type SlideImage } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

export default function MarkdownLightbox({ index, slides, close }: {
  index: number;
  slides?: SlideImage[];
  close: () => void;
}) {
  return <Lightbox plugins={[Download, Zoom, Counter]} index={index} slides={slides} open close={close} />;
}
