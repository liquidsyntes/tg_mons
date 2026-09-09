export function calculatePostER(post: {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
}): number | null {
  if (!post.subscribersAtPublish || post.subscribersAtPublish <= 0) {
    return null;
  }

  const views = post.views || 0;
  const reactions = post.reactions || 0;
  const comments = post.comments || 0;
  const forwards = post.forwards || 0;

  const totalEngagement = views + reactions + comments + forwards;

  return (totalEngagement / post.subscribersAtPublish) * 100;
}

export function aggregateChannelER(
  posts: {
    views?: number | null;
    reactions?: number | null;
    comments?: number | null;
    forwards?: number | null;
    subscribersAtPublish?: number | null;
  }[]
): number | null {
  let sumER = 0;
  let count = 0;

  for (const post of posts) {
    const er = calculatePostER(post);
    if (er !== null) {
      sumER += er;
      count++;
    }
  }

  return count > 0 ? sumER / count : null;
}

export function calculatePostERR(post: {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
}): number | null {
  if (!post.views || post.views <= 0) {
    return null;
  }
  const total = (post.reactions || 0) + (post.comments || 0) + (post.forwards || 0);
  return (total / post.views) * 100;
}

export function aggregateChannelERR(
  posts: {
    views?: number | null;
    reactions?: number | null;
    comments?: number | null;
    forwards?: number | null;
  }[]
): number | null {
  let sumERR = 0;
  let count = 0;
  let allZero = true;

  for (const post of posts) {
    const err = calculatePostERR(post);
    if (err !== null) {
      sumERR += err;
      count++;
      const total = (post.reactions || 0) + (post.comments || 0) + (post.forwards || 0);
      if (total > 0) {
        allZero = false;
      }
    }
  }

  if (count === 0) return null;
  if (allZero) return null;

  return sumERR / count;
}
