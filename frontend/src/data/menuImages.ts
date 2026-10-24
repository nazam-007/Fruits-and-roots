import type { MenuItem } from "./menu";

const imageUrl = (photoId: string) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=900&q=85`;

const menuItemImages: Record<string, string> = {
  "drink-banana": imageUrl("1571771894821-ce9b6c11b08e"),
  "drink-date": imageUrl("1546173159-315724a31696"),
  "drink-date-&-banana": imageUrl("1623065422902-30a2d299bbe4"),
  "drink-mango": imageUrl("1553279768-865429fa0078"),
  "drink-kiwi": imageUrl("1585059895524-72359e06133a"),
  "drink-dry-fruit": imageUrl("1615485500704-8e990f9900f7"),
  "drink-dragon": imageUrl("1595743825637-cdafc8ad4173"),
  "drink-blueberry": imageUrl("1498557850523-fd3d118b962e"),
  "drink-strawberry": imageUrl("1464965911861-746a04b4bca6"),
  "drink-avocado": imageUrl("1523049673857-eb18f1d7b578"),
  "drink-pineapple": imageUrl("1550258987-190a2d41a8ba"),
  "drink-mosambi": imageUrl("1600271886742-f049cd451bba"),
  "drink-watermelon": imageUrl("1596591606975-97ee5cef3a1e"),
  "drink-beetroot": imageUrl("1551751299-1b51cab2694c"),
  "drink-abc": imageUrl("1553530666-ba11a7da3888"),
  "drink-grape": imageUrl("1537640538966-79f369143f8f"),
  "drink-mix-fruit": imageUrl("1518843875459-f738682238a6"),
  "drink-anar": imageUrl("1541344999736-83eca272f6fc"),
  "drink-orange": imageUrl("1547514701-42782101795e"),
  "drink-apple": imageUrl("1560806887-1e4cd0b6cbd6"),
  "drink-lassi": imageUrl("1570197788417-0e82375c9371"),
  "drink-cold-coffee": imageUrl("1509042239860-f550ce710b93"),
  "drink-persian-tea": imageUrl("1544787219-7f47ccb76574"),
  "drink-turkish-tea": imageUrl("1564890369478-c89ca6d9cde9"),
  "drink-filter-coffee": imageUrl("1541167760496-1628856ab772"),
  "mix-fruit-salad": imageUrl("1490474418585-ba9bad8fd0ea"),
  "exotic-fruit-salad": imageUrl("1511690743698-d9d85f2fbf38"),
  "fruit-date-delight": imageUrl("1488477181946-6428a0291777"),
  "biscoff-fruit-custard": imageUrl("1486427944299-d1955d23e34d"),
  "brownie-strawberry": imageUrl("1606313564200-e75d5e30476c"),
  "strawberry-chocolate": imageUrl("1563805042-7684c019e1cb"),
  "single-choco-waffle": imageUrl("1528207776546-365bb710ee93"),
  "triple-choco-waffle": imageUrl("1562376552-0d160a2f238d"),
  "fruit-choco-waffle": imageUrl("1571115177098-24ec42ed204d"),
  "avocado-sandwich": imageUrl("1528735602780-2552fd46c7af"),
  "paneer-sandwich": imageUrl("1539252554453-80ab65ce3586"),
  "aalu-cheese-burger": imageUrl("1568901346375-23c9450c58cd"),
};

export function getMenuItemImage(item: MenuItem): string | undefined {
  return item.image ?? menuItemImages[item.id];
}
