// 微信 mp 平台 API 返回类型 + publish_page 二次 parse,搬自 wechat-article-exporter/types/types.d.ts。

export interface MpBaseResp {
  ret: number;
  err_msg?: string;
}

/** appmsgpublish 顶层响应(publish_page 是 JSON 字符串,需二次 parse)。 */
export interface AppMsgPublishResponse {
  base_resp: MpBaseResp;
  publish_page: string;
}

export interface PublishListItem {
  publish_type: number;
  publish_info: string; // JSON 字符串,需二次 parse
}

export interface PublishPage {
  featured_count: number;
  masssend_count: number;
  publish_count: number;
  publish_list: PublishListItem[];
  total_count: number;
}

export interface PublishInfo {
  type: number;
  msgid: string;
  appmsgex: AppMsgEx[];
}

/** 一篇文章的原始字段(原项目 AppMsgEx: types.d.ts:136-166)。 */
export interface AppMsgEx {
  aid: string;
  appmsgid: number;
  author_name: string;
  cover: string;
  create_time: number;
  digest: string;
  is_deleted: boolean;
  item_show_type: number;
  itemidx: number;
  link: string;
  title: string;
  update_time: number;
}

export interface SearchBizResponse {
  base_resp: MpBaseResp;
  list: AccountInfo[];
  total: number;
}

export interface AccountInfo {
  alias: string;
  fakeid: string;
  nickname: string;
  round_head_img: string;
  service_type: number;
  signature: string;
}

/**
 * 二次 parse publish_page JSON 字符串 → 文章列表。
 * 微信 appmsgpublish 返回 {publish_page: "<JSON string>"},其内 publish_list[].publish_info
 * 又是 JSON 字符串,需再 parse 才能拿 appmsgex(原项目 server/api/public/v1/article.get.ts:70-83)。
 */
export function parseArticles(publishPageJson: string): { total: number; articles: AppMsgEx[] } {
  const publishPage = JSON.parse(publishPageJson) as PublishPage;
  const articles: AppMsgEx[] = publishPage.publish_list
    .filter((item) => !!item.publish_info)
    .flatMap((item) => (JSON.parse(item.publish_info) as PublishInfo).appmsgex ?? []);
  return { total: publishPage.total_count, articles };
}
