import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useChildStore } from "@/stores/child-store";

export interface MyChild {
  id: string;
  name: string;
  studentIdNumber?: string;
  className?: string;
}

/**
 * The signed-in parent's children.
 *
 * Every parent page begins the same way: work out whose record to show. The
 * link lives on the user record, so this is one request cached under one key
 * rather than the same fetch pasted into each page.
 */
export function useMyChildren() {
  const { user } = useAuthStore();
  return useQuery<MyChild[]>({
    queryKey: ["my-children", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await api.get(`/users/${user!.id}`);
      const links = res.data?.parentStudents ?? [];
      return links
        .filter((ps: any) => ps?.student?.user)
        .map((ps: any) => ({
          id: ps.student.id,
          name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
          studentIdNumber: ps.student.studentIdNumber,
          className: ps.student.classSection?.name,
        }));
    },
  });
}

/**
 * Which of the parent's children a page shows, and how to change it.
 *
 * The choice is shared by every parent page. Until the parent makes one, or
 * when the one held is not among these children, it falls to the first:
 * most parents have a single child and the page should be useful at once.
 */
export function useChosenChild(
  children: { id: string }[] | undefined,
): [string, (id: string) => void] {
  const held = useChildStore((s) => s.childId);
  const choose = useChildStore((s) => s.choose);
  const mine = held && children?.some((c) => c.id === held) ? held : null;
  return [mine ?? children?.[0]?.id ?? "", choose];
}
