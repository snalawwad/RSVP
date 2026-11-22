// The guest list now sits on the event's page (Sama's Figma 24e): old links to /guests go there.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Guests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/event/${id}` as never} />;
}
