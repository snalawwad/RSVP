// The sheets any tab can open: send one by one, add guests. (The door's requests live at the top of Arrivals;
// the red bar on Home goes there, like host.html.)
import { AddSheet } from './AddSheet';
import { SendQueue } from './SendQueue';

export function HostSheets() {
  return (
    <>
      <SendQueue />
      <AddSheet />
    </>
  );
}
