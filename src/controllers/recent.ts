import { Request, Response, Locals, NextFunction } from 'express';
import { ParsedQs } from 'qs';
import nconf from 'nconf';
import user from '../user';
import categories from '../categories';
import topics from '../topics';
import meta from '../meta';
import helpers from './helpers';
import pagination from '../pagination';
import privileges from '../privileges';
import { Breadcrumbs, Pagination } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path: string = nconf.get('relative_path');

interface RecentRequest extends Request {
  uid: number,
  loggedIn: boolean
}

type FilterType = {
    name: string,
    url: string,
    selected: string,
    filter: string,
    icon: string
}

type TermType = {
    name: string,
    url: string,
    selected: string,
    term: string,
}

type RecentDataType = {
    title: string,
    breadcrumbs: Breadcrumbs,
    canPost: boolean,
    showTopicTools: boolean,
    showSelect: boolean,
    allCategoriesUrl: string,
    selectedCategory: string,
    selectedCids: number[],
    rssFeedUrl: string,
    filters: FilterType[],
    selectedFilter: FilterType,
    terms: TermType[],
    selectedTerm: TermType,
    topicCount: number,
    pagination: Pagination
}

const canPostTopic = async (uid: number): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let cids: number[] = await categories.getAllCidsFromSet('categories:cid');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    cids = await privileges.categories.filterCids('topics:create', cids, uid);
    return cids.length > 0;
};

export const getData = async (req: RecentRequest, url: string, sort: string): Promise<RecentDataType> => {
    const { originalUrl, loggedIn, query, uid, res } = req;
    const { cid, tags } = query;
    const page: number = parseInt(query.page as string, 10) || 1;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    let term: string = helpers.terms[query.term];
    const filter: ParsedQs[string] = query.filter || '';

    if (!term && query.term) {
        return null;
    }
    term = term || 'alltime';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [settings, categoryData, rssToken, canPost, isPrivileged] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.getSettings(uid),
        helpers.getSelectedCategory(cid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        user.auth.getFeedToken(uid),
        canPostTopic(uid),
        user.isPrivileged(uid),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const start: number = Math.max(0, (page - 1) * settings.topicsPerPage);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const stop: number = start + (settings.topicsPerPage as number) - 1;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const data: RecentDataType = await topics.getSortedTopics({
        cids: cid,
        tags: tags,
        uid: uid,
        start: start,
        stop: stop,
        filter: filter,
        term: term,
        sort: sort,
        floatPinned: query.pinned,
        query: query,
    });

    const isDisplayedAsHome = !(originalUrl.startsWith(`${relative_path}/api/${url}`) || originalUrl.startsWith(`${relative_path}/${url}`));
    const baseUrl: string = isDisplayedAsHome ? '' : url;

    if (isDisplayedAsHome) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        data.title = meta.config.homePageTitle || '[[pages:home]]';
    } else {
        data.title = `[[pages:${url}]]`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data.breadcrumbs = helpers.buildBreadcrumbs([{ text: `[[${url}:title]]` }]);
    }

    data.canPost = canPost;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.showSelect = isPrivileged;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.showTopicTools = isPrivileged;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.allCategoriesUrl = baseUrl + helpers.buildQueryString(query, 'cid', '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data.selectedCategory = categoryData.selectedCategory;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data.selectedCids = categoryData.selectedCids;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;
    data.rssFeedUrl = `${relative_path}/${url}.rss`;
    if (loggedIn) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.rssFeedUrl += `?uid=${uid}&token=${rssToken}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.filters = helpers.buildFilters(baseUrl, filter, query);
    data.selectedFilter = data.filters.find(filter => filter && filter.selected);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.terms = helpers.buildTerms(baseUrl, term, query);
    data.selectedTerm = data.terms.find(term => term && term.selected);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const pageCount: number = Math.max(1, Math.ceil(data.topicCount / settings.topicsPerPage));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.pagination = pagination.create(page, pageCount, query);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    helpers.addLinkTags({ url: url, res: res, tags: data.pagination.rel });
    return data;
};

export const get = async (req: RecentRequest, res: Response<object, Locals>, next: NextFunction): Promise<void> => {
    const data: RecentDataType = await getData(req, 'recent', 'recent');
    if (!data) {
        return next();
    }
    res.render('recent', data);
};
